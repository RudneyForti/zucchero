"use client";

import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  Search,
} from "lucide-react";
import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

export type ComboboxOption = {
  value: string;
  label: string;
  keywords?: string;
  group?: string;
  kind?: "default" | "create";
};

type SearchableComboboxProps = {
  id: string;
  name: string;
  options: ComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  required?: boolean;
  autoFocus?: boolean;
  ariaLabel?: string;
  createOptionLabel?: string;
  onCreateOption?: (query: string) => void;
  searchable?: boolean;
};

type ResolvedComboboxOption = ComboboxOption & {
  createQuery?: string;
};

type TextFieldProps = ComponentPropsWithoutRef<"input">;

export function TextField({ className, ...props }: TextFieldProps) {
  return (
    <input
      {...props}
      className={["text-field-input", className].filter(Boolean).join(" ")}
    />
  );
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function SearchableCombobox({
  id,
  name,
  options,
  value,
  onValueChange,
  placeholder = "Busque ou escolha uma opção",
  emptyMessage = "Nenhuma opção encontrada.",
  required = false,
  autoFocus = false,
  ariaLabel,
  createOptionLabel = "Criar",
  onCreateOption,
  searchable = true,
}: SearchableComboboxProps) {
  const listId = `${useId().replaceAll(":", "")}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedOption = options.find((option) => option.value === value);
  const [query, setQuery] = useState(selectedOption?.label ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const filteredOptions = useMemo<ResolvedComboboxOption[]>(() => {
    const normalizedQuery = normalizeSearch(query);
    const showingSelectedLabel = query === selectedOption?.label;
    if (!normalizedQuery || showingSelectedLabel) return options;

    const matches: ResolvedComboboxOption[] = options.filter(
      (option) =>
        option.kind === "create" ||
        normalizeSearch(`${option.label} ${option.keywords ?? ""}`).includes(
          normalizedQuery,
        ),
    );
    const hasExactMatch = options.some(
      (option) => normalizeSearch(option.label) === normalizedQuery,
    );

    if (onCreateOption && normalizedQuery.length >= 2 && !hasExactMatch) {
      matches.push({
        value: `__create__:${normalizedQuery}`,
        label: `${createOptionLabel} “${query.trim()}”`,
        kind: "create",
        createQuery: query.trim(),
      });
    }

    return matches;
  }, [
    createOptionLabel,
    onCreateOption,
    options,
    query,
    selectedOption?.label,
  ]);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target)) {
        setOpen(false);
        setQuery(selectedOption?.label ?? "");
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open, selectedOption?.label]);

  function openList() {
    const selectedIndex = options.findIndex((option) => option.value === value);
    setActiveIndex(Math.max(0, selectedIndex));
    setOpen(true);
  }

  function selectOption(option: ResolvedComboboxOption) {
    if (option.createQuery !== undefined && onCreateOption) {
      setOpen(false);
      onCreateOption(option.createQuery);
      return;
    }
    onValueChange(option.value);
    setQuery(option.label);
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleQueryChange(nextQuery: string) {
    const normalizedQuery = normalizeSearch(nextQuery);
    const nextOptions = options.filter(
      (option) =>
        option.kind === "create" ||
        normalizeSearch(`${option.label} ${option.keywords ?? ""}`).includes(
          normalizedQuery,
        ),
    );

    setQuery(nextQuery);
    setActiveIndex(nextOptions.length > 0 ? 0 : -1);
    setOpen(true);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      setActiveIndex((current) =>
        Math.min(current + 1, filteredOptions.length - 1),
      );
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      setActiveIndex((current) => Math.max(current - 1, 0));
    }

    if (event.key === "Enter" && open && activeIndex >= 0) {
      const activeOption = filteredOptions[activeIndex];
      if (activeOption) {
        event.preventDefault();
        selectOption(activeOption);
      }
    }

    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      setQuery(selectedOption?.label ?? "");
    }
  }

  const activeOption = filteredOptions[activeIndex];

  return (
    <div className="searchable-combobox" ref={rootRef} data-open={open}>
      <div className="combobox-control">
        {searchable ? (
          <Search className="combobox-search-icon" aria-hidden="true" />
        ) : null}
        <input
          ref={inputRef}
          className="combobox-input"
          id={id}
          type="text"
          value={query}
          placeholder={placeholder}
          required={required}
          autoFocus={autoFocus}
          autoComplete="off"
          readOnly={!searchable}
          role="combobox"
          aria-autocomplete={searchable ? "list" : "none"}
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={
            open && activeOption ? `${listId}-option-${activeIndex}` : undefined
          }
          onClick={openList}
          onChange={
            searchable
              ? (event) => handleQueryChange(event.target.value)
              : undefined
          }
          onKeyDown={handleKeyDown}
        />
        <button
          className="combobox-toggle"
          type="button"
          tabIndex={-1}
          aria-label={open ? "Fechar opções" : "Mostrar opções"}
          onClick={() => {
            if (open) {
              setOpen(false);
              return;
            }
            inputRef.current?.focus();
            openList();
          }}
        >
          {open ? (
            <ChevronUp aria-hidden="true" />
          ) : (
            <ChevronDown aria-hidden="true" />
          )}
        </button>
      </div>

      <input
        type="hidden"
        name={name}
        value={query === selectedOption?.label ? value : ""}
      />

      {open ? (
        <div className="combobox-popup">
          <div className="combobox-popup-clip rounded-scroll-shell">
            <ul
              className="combobox-list rounded-scroll-area"
              id={listId}
              role="listbox"
            >
              {filteredOptions.map((option, index) => (
                <Fragment key={option.value}>
                  {option.group &&
                  option.group !== filteredOptions[index - 1]?.group ? (
                    <li className="combobox-group" role="presentation">
                      {option.group}
                    </li>
                  ) : null}
                  <li
                    id={`${listId}-option-${index}`}
                    className="combobox-option"
                    data-active={index === activeIndex}
                    data-kind={option.kind ?? "default"}
                    role="option"
                    aria-selected={option.value === value}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectOption(option)}
                  >
                    <span>{option.label}</span>
                    {option.value === value ? (
                      <Check aria-hidden="true" />
                    ) : null}
                  </li>
                </Fragment>
              ))}

              {filteredOptions.length === 0 ? (
                <li
                  className="combobox-empty"
                  role="option"
                  aria-selected="false"
                  aria-disabled="true"
                >
                  {emptyMessage}
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type NumberFieldProps = {
  id: string;
  name: string;
  defaultValue?: string;
  min?: number;
  max?: number;
  step?: number;
  validationStep?: number | "any";
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  required?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
  integerOnly?: boolean;
  ariaDescribedBy?: string;
};

function decimalPlaces(value: number) {
  const [, decimals = ""] = String(value).split(".");
  return decimals.length;
}

export function NumberField({
  id,
  name,
  defaultValue = "",
  min,
  max,
  step = 1,
  validationStep,
  placeholder,
  prefix,
  suffix,
  required = false,
  value: controlledValue,
  onValueChange,
  integerOnly = false,
  ariaDescribedBy,
}: NumberFieldProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const value = controlledValue ?? internalValue;

  function setValue(nextValue: string) {
    if (controlledValue === undefined) setInternalValue(nextValue);
    onValueChange?.(nextValue);
  }

  function changeBy(direction: 1 | -1) {
    const parsed = Number(value);
    const precision = decimalPlaces(step);
    const factor = 10 ** precision;
    let next = Number.isFinite(parsed)
      ? Math.round((parsed + direction * step) * factor) / factor
      : (min ?? (direction === 1 ? step : 0));

    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    setValue(next.toFixed(precision));
  }

  return (
    <div className="number-field">
      {prefix ? (
        <span className="number-field-prefix" aria-hidden="true">
          {prefix}
        </span>
      ) : null}
      <input
        className="number-field-input"
        id={id}
        name={name}
        type="number"
        min={min}
        max={max}
        step={validationStep ?? step}
        inputMode={integerOnly ? "numeric" : "decimal"}
        value={value}
        placeholder={placeholder}
        required={required}
        aria-describedby={ariaDescribedBy}
        onChange={(event) => {
          const next = event.target.value;
          if (!integerOnly || /^\d*$/.test(next)) setValue(next);
        }}
      />
      {suffix ? (
        <span className="number-field-suffix" aria-hidden="true">
          {suffix}
        </span>
      ) : null}
      <span className="number-field-steppers">
        <button
          type="button"
          aria-label="Aumentar valor"
          onClick={() => changeBy(1)}
        >
          <ChevronUp aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Diminuir valor"
          onClick={() => changeBy(-1)}
        >
          <ChevronDown aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}

type TimePickerProps = {
  id: string;
  name: string;
  defaultValue?: string;
  value?: string;
  required?: boolean;
  stepMinutes?: number;
  ariaLabel?: string;
  onValueChange?: (value: string) => void;
};

function validTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  return Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

function maskTime(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  return digits.length <= 2
    ? digits
    : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function TimePicker({
  id,
  name,
  defaultValue = "",
  value: controlledValue,
  required = false,
  stepMinutes = 5,
  ariaLabel,
  onValueChange,
}: TimePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selected = controlledValue ?? internalValue;
  const [typedValue, setTypedValue] = useState<string | null>(null);
  const displayValue = typedValue ?? selected;
  const [draftHour, setDraftHour] = useState(selected.slice(0, 2) || "09");
  const [draftMinute, setDraftMinute] = useState(selected.slice(3, 5) || "00");
  const [open, setOpen] = useState(false);
  const hours = useMemo(
    () => Array.from({ length: 24 }, (_, index) => padNumber(index)),
    [],
  );
  const minutes = useMemo(
    () =>
      Array.from(
        { length: Math.ceil(60 / Math.max(1, stepMinutes)) },
        (_, index) => padNumber(index * Math.max(1, stepMinutes)),
      ).filter((minute) => Number(minute) < 60),
    [stepMinutes],
  );

  useEffect(() => {
    if (!open) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      inputRef.current?.focus();
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function setValue(nextValue: string) {
    if (controlledValue === undefined) setInternalValue(nextValue);
    setTypedValue(null);
    onValueChange?.(nextValue);
  }

  function openPicker() {
    const source = validTime(displayValue)
      ? displayValue
      : validTime(selected)
        ? selected
        : "09:00";
    setDraftHour(source.slice(0, 2));
    setDraftMinute(source.slice(3, 5));
    setOpen(true);
  }

  function commitTypedTime() {
    if (!displayValue && !required) {
      setValue("");
      return;
    }
    if (validTime(displayValue)) {
      setValue(displayValue);
      return;
    }
    setTypedValue(null);
  }

  const controlLabel = ariaLabel ?? "Horário";

  return (
    <div className="time-picker" ref={rootRef} data-open={open}>
      <div className="time-field-control">
        <input
          ref={inputRef}
          className="time-field-input"
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="hh:mm"
          pattern="(?:[01]\d|2[0-3]):[0-5]\d"
          title="Use o formato de 24 horas, por exemplo 17:30"
          value={displayValue}
          required={required}
          aria-label={ariaLabel}
          onChange={(event) => setTypedValue(maskTime(event.target.value))}
          onBlur={commitTypedTime}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              openPicker();
            }
            if (event.key === "Escape" && open) {
              event.preventDefault();
              setOpen(false);
            }
          }}
        />
        <button
          className="time-picker-toggle"
          type="button"
          aria-label={`${open ? "Fechar" : "Abrir"} seletor de ${controlLabel}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (open) {
              setOpen(false);
              inputRef.current?.focus();
              return;
            }
            openPicker();
          }}
        >
          <Clock3 aria-hidden="true" />
        </button>
      </div>

      <input type="hidden" name={name} value={selected} />

      {open ? (
        <div className="time-popover" role="dialog" aria-label={controlLabel}>
          <div className="time-popover-head">
            <strong>Escolha o horário</strong>
            <span>
              {draftHour}:{draftMinute}
            </span>
          </div>
          <div className="time-picker-columns">
            <div>
              <small>Hora</small>
              <div className="time-option-list rounded-scroll-area">
                {hours.map((hour) => (
                  <button
                    type="button"
                    key={hour}
                    aria-pressed={draftHour === hour}
                    onClick={() => setDraftHour(hour)}
                  >
                    {hour}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <small>Minuto</small>
              <div className="time-option-list rounded-scroll-area">
                {minutes.map((minute) => (
                  <button
                    type="button"
                    key={minute}
                    aria-pressed={draftMinute === minute}
                    onClick={() => setDraftMinute(minute)}
                  >
                    {minute}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="time-picker-actions">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                inputRef.current?.focus();
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                setValue(`${draftHour}:${draftMinute}`);
                setOpen(false);
                inputRef.current?.focus();
              }}
            >
              Aplicar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type TextAreaFieldProps = {
  id: string;
  name?: string;
  defaultValue?: string;
  value?: string;
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
  required?: boolean;
  ariaDescribedBy?: string;
  onValueChange?: (value: string) => void;
};

export function TextAreaField({
  id,
  name,
  defaultValue = "",
  value: controlledValue,
  placeholder,
  minLength,
  maxLength = 500,
  required = false,
  ariaDescribedBy,
  onValueChange,
}: TextAreaFieldProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const value = controlledValue ?? internalValue;

  return (
    <div className="textarea-field">
      <textarea
        className="textarea-field-input"
        id={id}
        name={name}
        value={value}
        placeholder={placeholder}
        minLength={minLength}
        maxLength={maxLength}
        required={required}
        aria-describedby={ariaDescribedBy}
        onChange={(event) => {
          const nextValue = event.target.value;
          if (controlledValue === undefined) setInternalValue(nextValue);
          onValueChange?.(nextValue);
        }}
      />
      <span className="textarea-field-count" aria-hidden="true">
        {value.length} / {maxLength}
      </span>
    </div>
  );
}

type DatePickerProps = {
  id: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  onValueChange?: (value: string) => void;
};

type CalendarDay = {
  date: Date;
  iso: string;
  day: number;
  inMonth: boolean;
};

const weekdays = ["D", "S", "T", "Q", "Q", "S", "S"];

function padNumber(value: number) {
  return String(value).padStart(2, "0");
}

function toIso(date: Date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function dateFromIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function displayFromIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

function isoFromDisplay(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const year = Number(match[3]);
  const date = new Date(year, month, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return toIso(date);
}

function maskDate(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function calendarDays(month: Date): CalendarDay[] {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      iso: toIso(date),
      day: date.getDate(),
      inMonth: date.getMonth() === month.getMonth(),
    };
  });
}

export function DatePicker({
  id,
  name,
  defaultValue = "",
  required = false,
  onValueChange,
}: DatePickerProps) {
  const calendarId = `${useId().replaceAll(":", "")}-calendar`;
  const today = useMemo(() => new Date(), []);
  const initialDate = dateFromIso(defaultValue) ?? today;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState(defaultValue);
  const [displayValue, setDisplayValue] = useState(
    displayFromIso(defaultValue),
  );
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1),
  );
  const [focusedDate, setFocusedDate] = useState(toIso(initialDate));
  const [placement, setPlacement] = useState<"above" | "below">("below");
  const [open, setOpen] = useState(false);
  const days = useMemo(() => calendarDays(visibleMonth), [visibleMonth]);
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(visibleMonth);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  function focusDay(iso: string) {
    requestAnimationFrame(() => {
      const button = rootRef.current?.querySelector<HTMLButtonElement>(
        `[data-calendar-date="${iso}"]`,
      );
      button?.focus();
    });
  }

  function openCalendar(moveFocus = false) {
    const rootRect = rootRef.current?.getBoundingClientRect();
    const scrollBoundary = rootRef.current
      ?.closest(".purchase-panel-scroll")
      ?.getBoundingClientRect();
    const boundaryTop = scrollBoundary?.top ?? 0;
    const boundaryBottom = scrollBoundary?.bottom ?? window.innerHeight;

    if (rootRect) {
      const roomAbove = rootRect.top - boundaryTop;
      const roomBelow = boundaryBottom - rootRect.bottom;
      setPlacement(
        roomBelow < 315 && roomAbove > roomBelow ? "above" : "below",
      );
    }

    const targetDate = dateFromIso(selected) ?? today;
    const targetIso = toIso(targetDate);
    setVisibleMonth(
      new Date(targetDate.getFullYear(), targetDate.getMonth(), 1),
    );
    setFocusedDate(targetIso);
    setOpen(true);
    if (moveFocus) focusDay(targetIso);
  }

  function chooseDate(date: Date) {
    const iso = toIso(date);
    setSelected(iso);
    onValueChange?.(iso);
    setDisplayValue(displayFromIso(iso));
    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setFocusedDate(iso);
    setOpen(false);
    inputRef.current?.focus();
  }

  function changeMonth(offset: number) {
    setVisibleMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + offset, 1),
    );
  }

  function moveCalendarFocus(currentDate: Date, offset: number) {
    const nextDate = new Date(currentDate);
    nextDate.setDate(currentDate.getDate() + offset);
    const iso = toIso(nextDate);
    setVisibleMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
    setFocusedDate(iso);
    focusDay(iso);
  }

  function handleDayKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    date: Date,
  ) {
    const movements: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const movement = movements[event.key];

    if (movement !== undefined) {
      event.preventDefault();
      moveCalendarFocus(date, movement);
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      inputRef.current?.focus();
    }
  }

  function commitTypedDate() {
    if (!displayValue) {
      setSelected("");
      onValueChange?.("");
      return;
    }

    const parsed = isoFromDisplay(displayValue);
    if (!parsed) {
      setDisplayValue(displayFromIso(selected));
      return;
    }

    const date = dateFromIso(parsed);
    setSelected(parsed);
    onValueChange?.(parsed);
    if (date) {
      setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
      setFocusedDate(parsed);
    }
  }

  return (
    <div
      className="date-picker"
      ref={rootRef}
      data-open={open}
      data-placement={placement}
    >
      <div className="date-field-control">
        <input
          ref={inputRef}
          className="date-field-input"
          id={id}
          type="text"
          value={displayValue}
          inputMode="numeric"
          placeholder="dd/mm/aaaa"
          autoComplete="off"
          required={required}
          onChange={(event) => setDisplayValue(maskDate(event.target.value))}
          onBlur={commitTypedDate}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              openCalendar(true);
            }
            if (event.key === "Escape" && open) {
              event.preventDefault();
              setOpen(false);
            }
          }}
        />
        <button
          type="button"
          className="date-picker-toggle"
          aria-label={open ? "Fechar calendário" : "Abrir calendário"}
          aria-haspopup="dialog"
          aria-expanded={open}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (open) {
              setOpen(false);
              inputRef.current?.focus();
              return;
            }
            openCalendar(true);
          }}
        >
          <CalendarDays aria-hidden="true" />
        </button>
      </div>

      <input type="hidden" name={name} value={selected} />

      {open ? (
        <div
          className="calendar-popover"
          id={calendarId}
          role="dialog"
          aria-label="Escolher data"
        >
          <div className="calendar-head">
            <strong aria-live="polite">{monthLabel}</strong>
            <div>
              <button
                type="button"
                aria-label="Mês anterior"
                onClick={() => changeMonth(-1)}
              >
                <ChevronLeft aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Próximo mês"
                onClick={() => changeMonth(1)}
              >
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="calendar-weekdays" aria-hidden="true">
            {weekdays.map((weekday, index) => (
              <span key={`${weekday}-${index}`}>{weekday}</span>
            ))}
          </div>

          <div className="calendar-grid" role="grid">
            {days.map((day) => {
              const isSelected = day.iso === selected;
              const isToday = day.iso === toIso(today);
              return (
                <button
                  type="button"
                  role="gridcell"
                  key={day.iso}
                  data-calendar-date={day.iso}
                  data-outside={!day.inMonth}
                  data-today={isToday}
                  aria-selected={isSelected}
                  tabIndex={day.iso === focusedDate ? 0 : -1}
                  aria-label={new Intl.DateTimeFormat("pt-BR", {
                    dateStyle: "long",
                  }).format(day.date)}
                  onFocus={() => setFocusedDate(day.iso)}
                  onKeyDown={(event) => handleDayKeyDown(event, day.date)}
                  onClick={() => chooseDate(day.date)}
                >
                  {day.day}
                </button>
              );
            })}
          </div>

          <div className="calendar-actions">
            <button
              type="button"
              onClick={() => {
                setSelected("");
                onValueChange?.("");
                setDisplayValue("");
                setOpen(false);
                inputRef.current?.focus();
              }}
            >
              Limpar
            </button>
            <button type="button" onClick={() => chooseDate(today)}>
              Hoje
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
