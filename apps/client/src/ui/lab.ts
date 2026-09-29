import { Badge, Button, Checkbox, Input, Surface, Toggle, Tooltip } from './primitives';
import './components.css';

document.title = 'Habbux · UI Lab (desenvolvimento)';
const lab = document.createElement('main');
lab.className = 'hbx-lab';
const heading = document.createElement('header');
heading.className = 'hbx-lab__heading';
const headingTitle = document.createElement('h1');
headingTitle.textContent = 'Habbux UI Core';
const headingText = document.createElement('p');
headingText.className = 'hbx-muted';
headingText.textContent = 'Laboratório de desenvolvimento · conteúdo técnico e temporário';
heading.append(headingTitle, headingText);
lab.append(heading);
const showcase = document.createElement('section');
showcase.className = 'hbx-surface hbx-lab__card';
const row = document.createElement('div');
row.className = 'hbx-lab__row';
const sample = Surface();
sample.textContent = 'Surface neutra';
sample.style.padding = 'var(--hbx-space-4)';
row.append(Button({ label: 'Ação principal', tone: 'primary' }), Button({ label: 'Desativado', disabled: true }),
  Tooltip(Button({ label: 'Foque ou passe o mouse', tone: 'quiet' }), 'Tooltip acessível'), Badge('Base'), Badge('Ativo', 'positive'),
  Checkbox('Checkbox'), Toggle('Toggle'));
const input = Input({ id: 'hbx-demo-input', label: 'Campo de texto', placeholder: 'Digite para testar foco' });
showcase.append(row, input.element, sample);
lab.append(showcase);
document.body.replaceChildren(lab);
