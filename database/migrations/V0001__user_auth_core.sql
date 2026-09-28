CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    username VARCHAR(20) NOT NULL,
    username_normalized VARCHAR(20) NOT NULL,
    email VARCHAR(254) NOT NULL,
    email_normalized VARCHAR(254) NOT NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
    CONSTRAINT pk_users PRIMARY KEY (id),
    CONSTRAINT uq_users_username_normalized UNIQUE (username_normalized),
    CONSTRAINT uq_users_email_normalized UNIQUE (email_normalized),
    CONSTRAINT ck_users_username_format CHECK (username ~ '^[A-Za-z][A-Za-z0-9_]{2,19}$'),
    CONSTRAINT ck_users_username_normalized CHECK (
        username_normalized = lower(username)
        AND username_normalized ~ '^[a-z][a-z0-9_]{2,19}$'
    ),
    CONSTRAINT ck_users_email_length CHECK (char_length(email) BETWEEN 3 AND 254),
    CONSTRAINT ck_users_email_normalized CHECK (
        email_normalized = lower(email)
        AND email_normalized ~ '^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,253}[.][a-z]{2,63}$'
        AND position('..' IN email_normalized) = 0
    ),
    CONSTRAINT ck_users_status CHECK (status IN ('ACTIVE', 'DISABLED'))
);

CREATE TABLE user_credentials (
    user_id BIGINT NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
    CONSTRAINT pk_user_credentials PRIMARY KEY (user_id),
    CONSTRAINT fk_user_credentials_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT ck_user_credentials_password_hash CHECK (
        char_length(password_hash) BETWEEN 80 AND 255
        AND password_hash LIKE '$argon2id$%'
    )
);
