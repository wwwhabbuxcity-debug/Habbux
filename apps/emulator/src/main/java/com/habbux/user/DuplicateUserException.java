package com.habbux.user;

public final class DuplicateUserException extends RuntimeException {
    private static final long serialVersionUID = 1L;
    public DuplicateUserException() { super("Username or email is already registered"); }
}
