ALTER TABLE user_credentials
    DROP CONSTRAINT ck_user_credentials_password_hash,
    ADD CONSTRAINT ck_user_credentials_password_hash CHECK (
        char_length(password_hash) BETWEEN 80 AND 255
        AND password_hash ~ '^\$argon2id\$v=19\$m=[0-9]+,t=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$'
    );
