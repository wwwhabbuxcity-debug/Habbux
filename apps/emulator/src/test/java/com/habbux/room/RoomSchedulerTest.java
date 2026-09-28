package com.habbux.room;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

class RoomSchedulerTest {
    @Test
    @Timeout(10)
    void processesTenThousandEventsInAdmissionOrderAndIsolatesHandlerFailures() throws Exception {
        RoomMetrics metrics = new RoomMetrics();
        RoomScheduler scheduler = new RoomScheduler(2, 4, metrics);
        try {
            RoomMailbox mailbox = scheduler.newMailbox(12_000, 102, 17, TimeUnit.MILLISECONDS.toNanos(100));
            int count = 10_000;
            CountDownLatch completed = new CountDownLatch(count + 1);
            AtomicInteger next = new AtomicInteger();
            AtomicReference<String> orderingFailure = new AtomicReference<>();
            for (int value = 0; value < count; value++) {
                int expected = value;
                assertTrue(mailbox.submit(() -> {
                    int actual = next.getAndIncrement();
                    if (actual != expected) orderingFailure.compareAndSet(null, actual + " != " + expected);
                    completed.countDown();
                }));
            }
            assertTrue(mailbox.submit((Runnable) () -> { throw new IllegalStateException("test room handler failure"); }));
            assertTrue(mailbox.submit(completed::countDown));
            assertTrue(completed.await(5, TimeUnit.SECONDS));
            long metricsDeadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(1);
            while (metrics.snapshot().processedEvents() < count + 2L && System.nanoTime() < metricsDeadline) {
                Thread.onSpinWait();
            }
            assertEquals(null, orderingFailure.get());
            assertEquals(1, metrics.snapshot().handlerFailures());
            assertEquals(count + 2L, metrics.snapshot().processedEvents());
        } finally {
            assertTrue(scheduler.close(Duration.ofSeconds(3)));
        }
    }

    @Test
    @Timeout(5)
    void differentRoomsRunAtTheSameTimeAndFairBatchesLetOtherRoomsProgress() throws Exception {
        RoomScheduler scheduler = new RoomScheduler(2, 4, new RoomMetrics());
        try {
            RoomMailbox first = scheduler.newMailbox(2_000, 10, 4, TimeUnit.MILLISECONDS.toNanos(100));
            RoomMailbox second = scheduler.newMailbox(2_000, 10, 4, TimeUnit.MILLISECONDS.toNanos(100));
            CountDownLatch bothStarted = new CountDownLatch(2);
            CountDownLatch allowFinish = new CountDownLatch(1);
            CountDownLatch secondDone = new CountDownLatch(1);
            AtomicInteger remainingFirst = new AtomicInteger(1_000);
            for (int index = 0; index < 1_000; index++) {
                assertTrue(first.submit(() -> {
                    if (remainingFirst.getAndDecrement() == 1_000) {
                        bothStarted.countDown();
                        try { allowFinish.await(2, TimeUnit.SECONDS); }
                        catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
                    }
                }));
            }
            assertTrue(second.submit(() -> { bothStarted.countDown(); secondDone.countDown(); }));
            assertTrue(bothStarted.await(2, TimeUnit.SECONDS), "two room workers must own different rooms concurrently");
            assertTrue(secondDone.await(1, TimeUnit.SECONDS), "second room must make progress before the first drains");
            assertTrue(remainingFirst.get() > 0, "event batches should yield room ownership between runs");
            allowFinish.countDown();
        } finally {
            assertTrue(scheduler.close(Duration.ofSeconds(3)));
        }
    }

    @Test
    @Timeout(5)
    void boundedMailboxRejectsOverflowWithoutBlockingCaller() throws Exception {
        RoomMetrics metrics = new RoomMetrics();
        RoomScheduler scheduler = new RoomScheduler(1, 2, metrics);
        try {
            RoomMailbox mailbox = scheduler.newMailbox(8, 2, 2, TimeUnit.MILLISECONDS.toNanos(100));
            CountDownLatch workerStarted = new CountDownLatch(1);
            CountDownLatch releaseWorker = new CountDownLatch(1);
            assertTrue(mailbox.submit(() -> {
                workerStarted.countDown();
                try { releaseWorker.await(2, TimeUnit.SECONDS); }
                catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
            }));
            assertTrue(workerStarted.await(1, TimeUnit.SECONDS));
            for (int index = 0; index < 6; index++) assertTrue(mailbox.submit(() -> { }));
            assertFalse(mailbox.submit(() -> { }));
            assertTrue(mailbox.submitCritical(() -> { }));
            assertTrue(mailbox.submitCritical(() -> { }));
            assertFalse(mailbox.submitCritical(() -> { }));
            assertEquals(2, metrics.snapshot().rejectedEvents());
            releaseWorker.countDown();
        } finally {
            assertTrue(scheduler.close(Duration.ofSeconds(3)));
        }
    }

    @Test
    @Timeout(5)
    void oneWorkerYieldsAfterConfiguredBatchSoAnotherRoomMakesProgress() throws Exception {
        RoomScheduler scheduler = new RoomScheduler(1, 4, new RoomMetrics());
        CountDownLatch releaseFirstEvent = new CountDownLatch(1);
        CountDownLatch releaseQuietRoom = new CountDownLatch(1);
        try {
            RoomMailbox hotRoom = scheduler.newMailbox(2_000, 10, 4, TimeUnit.MILLISECONDS.toNanos(100));
            RoomMailbox quietRoom = scheduler.newMailbox(8, 2, 4, TimeUnit.MILLISECONDS.toNanos(100));
            CountDownLatch firstEventStarted = new CountDownLatch(1);
            CountDownLatch quietRoomStarted = new CountDownLatch(1);
            AtomicInteger hotEventsRemaining = new AtomicInteger(1_000);
            assertTrue(hotRoom.submit(() -> {
                firstEventStarted.countDown();
                try { releaseFirstEvent.await(2, TimeUnit.SECONDS); }
                catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
                hotEventsRemaining.decrementAndGet();
            }));
            assertTrue(firstEventStarted.await(1, TimeUnit.SECONDS));
            for (int index = 0; index < 999; index++) assertTrue(hotRoom.submit(hotEventsRemaining::decrementAndGet));
            assertTrue(quietRoom.submit(() -> {
                quietRoomStarted.countDown();
                try { releaseQuietRoom.await(2, TimeUnit.SECONDS); }
                catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
            }));
            releaseFirstEvent.countDown();
            assertTrue(quietRoomStarted.await(1, TimeUnit.SECONDS));
            assertTrue(hotEventsRemaining.get() > 0,
                    "the hot room must yield its worker between bounded event batches");
        } finally {
            releaseFirstEvent.countDown();
            releaseQuietRoom.countDown();
            assertTrue(scheduler.close(Duration.ofSeconds(3)));
        }
    }

    @Test
    @Timeout(5)
    void timeBudgetStopsASecondRoomFromWaitingBehindAnOverBudgetBatch() throws Exception {
        RoomScheduler scheduler = new RoomScheduler(1, 4, new RoomMetrics());
        CountDownLatch releaseFirst = new CountDownLatch(1);
        CountDownLatch releaseQuiet = new CountDownLatch(1);
        try {
            RoomMailbox hotRoom = scheduler.newMailbox(128, 10, 1_000, TimeUnit.MILLISECONDS.toNanos(1));
            RoomMailbox quietRoom = scheduler.newMailbox(8, 2, 1_000, TimeUnit.MILLISECONDS.toNanos(1));
            CountDownLatch firstStarted = new CountDownLatch(1);
            CountDownLatch quietStarted = new CountDownLatch(1);
            AtomicInteger hotRemaining = new AtomicInteger(20);
            assertTrue(hotRoom.submit(() -> {
                firstStarted.countDown();
                try { releaseFirst.await(2, TimeUnit.SECONDS); }
                catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
                hotRemaining.decrementAndGet();
            }));
            assertTrue(firstStarted.await(1, TimeUnit.SECONDS));
            for (int index = 0; index < 19; index++) assertTrue(hotRoom.submit(hotRemaining::decrementAndGet));
            assertTrue(quietRoom.submit(() -> {
                quietStarted.countDown();
                try { releaseQuiet.await(2, TimeUnit.SECONDS); }
                catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
            }));
            Thread.sleep(5);
            releaseFirst.countDown();
            assertTrue(quietStarted.await(1, TimeUnit.SECONDS));
            assertTrue(hotRemaining.get() > 0,
                    "time budget is checked between events and requeues the hot room at the tail");
        } finally {
            releaseFirst.countDown();
            releaseQuiet.countDown();
            assertTrue(scheduler.close(Duration.ofSeconds(3)));
        }
    }
}
