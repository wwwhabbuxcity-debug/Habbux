CREATE TABLE rooms (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    owner_user_id BIGINT NOT NULL,
    name VARCHAR(64) NOT NULL,
    description VARCHAR(256) NOT NULL DEFAULT '',
    capacity SMALLINT NOT NULL,
    grid_width SMALLINT NOT NULL,
    grid_height SMALLINT NOT NULL,
    grid_walkability BYTEA NOT NULL,
    spawn_x SMALLINT NOT NULL,
    spawn_y SMALLINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
    CONSTRAINT pk_rooms PRIMARY KEY (id),
    CONSTRAINT fk_rooms_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT ck_rooms_name_bytes CHECK (octet_length(name) BETWEEN 1 AND 128),
    CONSTRAINT ck_rooms_description_bytes CHECK (octet_length(description) <= 512),
    CONSTRAINT ck_rooms_capacity CHECK (capacity BETWEEN 1 AND 100),
    CONSTRAINT ck_rooms_grid_dimensions CHECK (grid_width BETWEEN 1 AND 64 AND grid_height BETWEEN 1 AND 64),
    CONSTRAINT ck_rooms_grid_walkability CHECK (octet_length(grid_walkability) = grid_width * grid_height),
    CONSTRAINT ck_rooms_spawn_bounds CHECK (spawn_x >= 0 AND spawn_x < grid_width AND spawn_y >= 0 AND spawn_y < grid_height),
    CONSTRAINT ck_rooms_spawn_walkable CHECK (get_byte(grid_walkability, spawn_y * grid_width + spawn_x) = 1)
);

CREATE INDEX idx_rooms_owner_id ON rooms (owner_user_id);
