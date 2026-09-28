package com.habbux.auth;

import com.habbux.security.Argon2idPasswordHasher;
import com.habbux.user.DuplicateUserException;
import com.habbux.user.AccountStatus;
import com.habbux.user.LoginIdentifier;
import com.habbux.user.StoredCredentials;
import com.habbux.user.UserIdentity;
import com.habbux.user.UserRepository;
import com.habbux.user.ValidatedUser;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;

/** Worker-only boundary for password hashing and PostgreSQL-backed authentication. */
public final class AuthService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final UserRepository users;
    private final AuthExecutor executor;
    private final Argon2idPasswordHasher hasher;
    private final IdentityFailureLimiter failures = new IdentityFailureLimiter();
    private final String dummyPasswordHash;

    public AuthService(UserRepository users, AuthExecutor executor, Argon2idPasswordHasher hasher) {
        this.users = users;
        this.executor = java.util.Objects.requireNonNull(executor, "executor");
        this.hasher = java.util.Objects.requireNonNull(hasher, "hasher");
        char[] dummy = new char[32];
        for (int index = 0; index < dummy.length; index++) dummy[index] = (char) ('a' + RANDOM.nextInt(26));
        dummyPasswordHash = hasher.hash(dummy);
    }

    public CompletableFuture<AuthResult> login(String identifier, char[] password) {
        java.util.Objects.requireNonNull(identifier, "identifier");
        java.util.Objects.requireNonNull(password, "password");
        if (users == null) {
            Arrays.fill(password, '\0');
            return CompletableFuture.completedFuture(AuthResult.failure(AuthFailure.UNAVAILABLE));
        }
        CompletableFuture<AuthResult> operation = executor.submit(() -> loginOnWorker(identifier, password));
        return mapAndWipe(operation, password);
    }

    public CompletableFuture<AuthResult> register(String username, String email, char[] password) {
        java.util.Objects.requireNonNull(username, "username");
        java.util.Objects.requireNonNull(email, "email");
        java.util.Objects.requireNonNull(password, "password");
        if (users == null) {
            Arrays.fill(password, '\0');
            return CompletableFuture.completedFuture(AuthResult.failure(AuthFailure.UNAVAILABLE));
        }
        CompletableFuture<AuthResult> operation = executor.submit(() -> registerOnWorker(username, email, password));
        return mapAndWipe(operation, password);
    }

    private AuthResult loginOnWorker(String rawIdentifier, char[] password) {
        LoginIdentifier identifier;
        try {
            identifier = LoginIdentifier.from(rawIdentifier);
        } catch (IllegalArgumentException exception) {
            Arrays.fill(password, '\0');
            return AuthResult.failure(AuthFailure.INVALID_REQUEST);
        }
        String key = identifier.normalizedValue();
        long now = System.nanoTime();
        if (failures.isBlocked(key, now)) {
            Arrays.fill(password, '\0');
            return AuthResult.failure(AuthFailure.RATE_LIMITED);
        }
        try {
            Optional<StoredCredentials> stored = users.findForAuthentication(identifier);
            if (stored.isEmpty()) {
                hasher.verify(password, dummyPasswordHash);
                failures.failed(key, now);
                return AuthResult.failure(AuthFailure.REJECTED);
            }
            StoredCredentials credentials = stored.orElseThrow();
            boolean validPassword = hasher.verify(password, credentials.passwordHash());
            if (!validPassword || credentials.status() != AccountStatus.ACTIVE) {
                failures.failed(key, now);
                return AuthResult.failure(AuthFailure.REJECTED);
            }
            failures.succeeded(key);
            return AuthResult.success(credentials.identity());
        } catch (RuntimeException exception) {
            Arrays.fill(password, '\0');
            return AuthResult.failure(AuthFailure.UNAVAILABLE);
        } finally {
            Arrays.fill(password, '\0');
        }
    }

    private AuthResult registerOnWorker(String username, String email, char[] password) {
        String limiterKey;
        try {
            limiterKey = ValidatedUser.normalizeLogin(username);
            if (failures.isBlocked(limiterKey, System.nanoTime())) return AuthResult.failure(AuthFailure.RATE_LIMITED);
            Argon2idPasswordHasher.validateRegistrationPassword(password);
            ValidatedUser user = ValidatedUser.create(username, email);
            String passwordHash = hasher.hash(password);
            UserIdentity created = users.create(user, passwordHash);
            failures.succeeded(limiterKey);
            return AuthResult.success(created);
        } catch (DuplicateUserException exception) {
            limiterKey = safeLimiterKey(username);
            if (limiterKey != null) failures.failed(limiterKey, System.nanoTime());
            return AuthResult.failure(AuthFailure.REJECTED);
        } catch (IllegalArgumentException exception) {
            Arrays.fill(password, '\0');
            return AuthResult.failure(AuthFailure.INVALID_REQUEST);
        } catch (RuntimeException exception) {
            Arrays.fill(password, '\0');
            return AuthResult.failure(AuthFailure.UNAVAILABLE);
        } finally {
            Arrays.fill(password, '\0');
        }
    }

    private static String safeLimiterKey(String username) {
        try { return ValidatedUser.normalizeLogin(username); }
        catch (IllegalArgumentException ignored) { return null; }
    }

    private static CompletableFuture<AuthResult> mapAndWipe(CompletableFuture<AuthResult> operation, char[] password) {
        return operation.handle((result, failure) -> {
            Arrays.fill(password, '\0');
            if (failure == null) return result;
            Throwable cause = failure instanceof CompletionException && failure.getCause() != null
                    ? failure.getCause() : failure;
            if (cause instanceof InterruptedException) Thread.currentThread().interrupt();
            return AuthResult.failure(AuthFailure.UNAVAILABLE);
        });
    }
}
