export type ButtonTone = 'primary' | 'neutral' | 'quiet';

export interface ButtonOptions {
  readonly label: string;
  readonly tone?: ButtonTone;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly title?: string;
  readonly onClick?: () => void;
}

export function Button(options: ButtonOptions): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `hbx-button hbx-button--${options.tone ?? 'neutral'}`;
  button.textContent = options.label;
  button.disabled = options.disabled ?? options.loading ?? false;
  button.title = options.title ?? '';
  if (options.loading) {
    button.setAttribute('aria-busy', 'true');
    button.append(document.createTextNode(' …'));
  }
  if (options.onClick) button.addEventListener('click', options.onClick);
  return button;
}

export function IconButton(label: string, icon: string, onClick: () => void): HTMLButtonElement {
  const button = Button({ label, tone: 'quiet', title: label, onClick });
  button.classList.add('hbx-icon-button');
  button.replaceChildren(Icon({ name: icon, label: '' }));
  button.setAttribute('aria-label', label);
  return button;
}

export interface IconOptions {
  readonly name: string;
  readonly label: string;
  readonly size?: 'sm' | 'md' | 'lg';
}

/** Named text-free icon slot; future project SVGs can replace its visual source. */
export function Icon(options: IconOptions): HTMLSpanElement {
  const icon = document.createElement('span');
  icon.className = `hbx-icon hbx-icon--${options.size ?? 'md'}`;
  icon.dataset.icon = options.name;
  icon.setAttribute('aria-hidden', 'true');
  if (options.label) icon.setAttribute('aria-label', options.label);
  return icon;
}

export interface InputOptions {
  readonly label: string;
  readonly id: string;
  readonly placeholder?: string;
  readonly helperText?: string;
  readonly error?: string;
  readonly disabled?: boolean;
  readonly type?: string;
}

export function Input(options: InputOptions): { readonly element: HTMLDivElement; readonly input: HTMLInputElement } {
  const wrapper = document.createElement('div');
  wrapper.className = 'hbx-field';
  const label = document.createElement('label');
  label.className = 'hbx-field__label';
  label.htmlFor = options.id;
  label.textContent = options.label;
  const input = document.createElement('input');
  input.className = 'hbx-input';
  input.id = options.id;
  input.type = options.type ?? 'text';
  input.placeholder = options.placeholder ?? '';
  input.disabled = options.disabled ?? false;
  const message = options.error ?? options.helperText;
  if (options.error) {
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', `${options.id}-message`);
  } else if (options.helperText) input.setAttribute('aria-describedby', `${options.id}-message`);
  wrapper.append(label, input);
  if (message) {
    const helper = document.createElement('span');
    helper.id = `${options.id}-message`;
    helper.className = options.error ? 'hbx-field__message hbx-field__message--error' : 'hbx-field__message';
    helper.textContent = message;
    wrapper.append(helper);
  }
  return { element: wrapper, input };
}

export function TextArea(label: string, id: string, placeholder = ''): { readonly element: HTMLDivElement; readonly input: HTMLTextAreaElement } {
  const wrapper = document.createElement('div');
  wrapper.className = 'hbx-field';
  const labelElement = document.createElement('label');
  labelElement.className = 'hbx-field__label';
  labelElement.htmlFor = id;
  labelElement.textContent = label;
  const input = document.createElement('textarea');
  input.className = 'hbx-input hbx-textarea';
  input.id = id;
  input.placeholder = placeholder;
  wrapper.append(labelElement, input);
  return { element: wrapper, input };
}

export function Checkbox(labelText: string, checked = false): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'hbx-check';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  const text = document.createElement('span');
  text.textContent = labelText;
  label.append(input, text);
  return label;
}

export function Toggle(labelText: string, checked = false): HTMLLabelElement {
  const label = Checkbox(labelText, checked);
  label.classList.add('hbx-toggle');
  const input = label.querySelector<HTMLInputElement>('input');
  input?.setAttribute('role', 'switch');
  input?.setAttribute('aria-checked', String(input.checked));
  input?.addEventListener('change', () => input.setAttribute('aria-checked', String(input.checked)));
  return label;
}

export function Badge(text: string, tone: 'neutral' | 'positive' | 'warning' = 'neutral'): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.className = `hbx-badge hbx-badge--${tone}`;
  badge.textContent = text;
  return badge;
}

export function Divider(): HTMLHRElement {
  const divider = document.createElement('hr');
  divider.className = 'hbx-divider';
  return divider;
}

export function Surface(className = ''): HTMLDivElement {
  const surface = document.createElement('div');
  surface.className = `hbx-surface ${className}`.trim();
  return surface;
}

export function ScrollArea(className = ''): HTMLDivElement {
  const area = document.createElement('div');
  area.className = `hbx-scroll-area ${className}`.trim();
  return area;
}

export function Tooltip(element: HTMLElement, text: string): HTMLElement {
  const wrapper = document.createElement('span');
  wrapper.className = 'hbx-tooltip';
  const tooltipId = `hbx-tooltip-${nextTooltipId++}`;
  const descriptions = element.getAttribute('aria-describedby');
  element.setAttribute('aria-describedby', descriptions ? `${descriptions} ${tooltipId}` : tooltipId);
  const content = document.createElement('span');
  content.id = tooltipId;
  content.className = 'hbx-tooltip__content';
  content.setAttribute('role', 'tooltip');
  content.textContent = text;
  wrapper.append(element);
  wrapper.append(content);
  return wrapper;
}

let nextTooltipId = 1;
