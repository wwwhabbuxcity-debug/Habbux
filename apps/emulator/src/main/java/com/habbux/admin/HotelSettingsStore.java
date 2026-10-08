package com.habbux.admin;

/** Persistent boundary for the owner-managed hotel controls. */
public interface HotelSettingsStore {
    HotelSettings load();

    HotelSettings save(HotelSettings settings);
}
