ALTER TABLE login_theme_state DROP CONSTRAINT ck_login_theme_state_theme;
ALTER TABLE login_theme_state ADD CONSTRAINT ck_login_theme_state_theme CHECK (active_theme IN (
    'neon-purple', 'tropical-blue', 'sunset-pink', 'cosmic-blue', 'emerald-garden',
    'desert-bazaar', 'arctic-lodge', 'underwater-coral', 'arcade-district', 'halloween-night',
    'easter-spring', 'christmas-village', 'carnival-night', 'new-year-rooftop'
));

ALTER TABLE login_theme_config DROP CONSTRAINT ck_login_theme_config_theme;
ALTER TABLE login_theme_config ADD CONSTRAINT ck_login_theme_config_theme CHECK (theme_id IN (
    'neon-purple', 'tropical-blue', 'sunset-pink', 'cosmic-blue', 'emerald-garden',
    'desert-bazaar', 'arctic-lodge', 'underwater-coral', 'arcade-district', 'halloween-night',
    'easter-spring', 'christmas-village', 'carnival-night', 'new-year-rooftop'
));

ALTER TABLE login_theme_history DROP CONSTRAINT ck_login_theme_history_theme;
ALTER TABLE login_theme_history ADD CONSTRAINT ck_login_theme_history_theme CHECK (theme_id IN (
    'neon-purple', 'tropical-blue', 'sunset-pink', 'cosmic-blue', 'emerald-garden',
    'desert-bazaar', 'arctic-lodge', 'underwater-coral', 'arcade-district', 'halloween-night',
    'easter-spring', 'christmas-village', 'carnival-night', 'new-year-rooftop'
));

INSERT INTO login_theme_config (theme_id, logo_text, eyebrow, title, description, cta_text, cta_visible, institutional_text, institutional_url, primary_color, secondary_color, button_color, glass_opacity, blur_pixels, card_opacity, glow_intensity, border_radius, decorations_enabled, hero_asset, updated_by)
VALUES
    ('emerald-garden', 'HABBUX', 'UM NOVO MUNDO ESTÁ NASCENDO', 'Entre, explore e faça parte.', 'Crie quartos, faça amizades e viva novas histórias no Habbux.', 'Descubra o Habbux', TRUE, '', '', '#21C58A', '#B6D55B', '#18A879', 68, 14, 76, 72, 16, TRUE, 'default', 'migration'),
    ('desert-bazaar', 'HABBUX', 'UM NOVO MUNDO ESTÁ NASCENDO', 'Entre, explore e faça parte.', 'Crie quartos, faça amizades e viva novas histórias no Habbux.', 'Descubra o Habbux', TRUE, '', '', '#F6A84C', '#D45B31', '#E8863E', 68, 14, 76, 72, 16, TRUE, 'default', 'migration'),
    ('arctic-lodge', 'HABBUX', 'UM NOVO MUNDO ESTÁ NASCENDO', 'Entre, explore e faça parte.', 'Crie quartos, faça amizades e viva novas histórias no Habbux.', 'Descubra o Habbux', TRUE, '', '', '#86D4F7', '#5A82D8', '#6FADE9', 68, 14, 76, 72, 16, TRUE, 'default', 'migration'),
    ('underwater-coral', 'HABBUX', 'UM NOVO MUNDO ESTÁ NASCENDO', 'Entre, explore e faça parte.', 'Crie quartos, faça amizades e viva novas histórias no Habbux.', 'Descubra o Habbux', TRUE, '', '', '#35D6D0', '#F579A8', '#2CBCC8', 68, 14, 76, 72, 16, TRUE, 'default', 'migration'),
    ('arcade-district', 'HABBUX', 'UM NOVO MUNDO ESTÁ NASCENDO', 'Entre, explore e faça parte.', 'Crie quartos, faça amizades e viva novas histórias no Habbux.', 'Descubra o Habbux', TRUE, '', '', '#FF4FAA', '#8657FF', '#D04DFF', 68, 14, 76, 72, 16, TRUE, 'default', 'migration'),
    ('halloween-night', 'HABBUX', 'UMA TEMPORADA ESPECIAL CHEGOU', 'Entre, explore e faça parte.', 'Uma noite de histórias, encontros e diversão no Habbux.', 'Descubra o Habbux', TRUE, '', '', '#F78B2E', '#8D3CCB', '#E56522', 68, 14, 76, 72, 16, TRUE, 'default', 'migration'),
    ('easter-spring', 'HABBUX', 'UMA TEMPORADA ESPECIAL CHEGOU', 'Entre, explore e faça parte.', 'Uma temporada cheia de cores, quartos e novas histórias.', 'Descubra o Habbux', TRUE, '', '', '#F49CD7', '#A17DEB', '#E984C8', 68, 14, 76, 72, 16, TRUE, 'default', 'migration'),
    ('christmas-village', 'HABBUX', 'UMA TEMPORADA ESPECIAL CHEGOU', 'Entre, explore e faça parte.', 'Celebre encontros e novas histórias no Habbux.', 'Descubra o Habbux', TRUE, '', '', '#D95357', '#30A77C', '#C83E51', 68, 14, 76, 72, 16, TRUE, 'default', 'migration'),
    ('carnival-night', 'HABBUX', 'UMA TEMPORADA ESPECIAL CHEGOU', 'Entre, explore e faça parte.', 'A festa começa com quartos, amizades e muita cor.', 'Descubra o Habbux', TRUE, '', '', '#F9C24D', '#FF4F8C', '#E93C93', 68, 14, 76, 72, 16, TRUE, 'default', 'migration'),
    ('new-year-rooftop', 'HABBUX', 'UMA TEMPORADA ESPECIAL CHEGOU', 'Entre, explore e faça parte.', 'Um novo capítulo começa com a comunidade Habbux.', 'Descubra o Habbux', TRUE, '', '', '#D9B968', '#5867E8', '#C9A954', 68, 14, 76, 72, 16, TRUE, 'default', 'migration');
