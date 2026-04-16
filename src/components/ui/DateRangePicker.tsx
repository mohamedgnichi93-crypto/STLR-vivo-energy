import * as React from 'react'
import { format, isValid, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CalendarIcon, X } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// ── Single Date Picker ─────────────────────────────────────
interface DatePickerProps {
  value: string           // YYYY-MM-DD
  onChange: (date: string) => void
  label?: string
  placeholder?: string
  minDate?: string        // YYYY-MM-DD
  maxDate?: string        // YYYY-MM-DD
  className?: string
  disabled?: boolean
}

export function DatePicker({
  value,
  onChange,
  label,
  placeholder = 'Sélectionner une date',
  minDate,
  maxDate,
  className,
  disabled = false,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  const selected = value && isValid(parseISO(value))
    ? parseISO(value)
    : undefined

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      onChange(format(date, 'yyyy-MM-dd'))
      setOpen(false)
    }
  }

  const minDateObj = minDate ? parseISO(minDate) : undefined
  const maxDateObj = maxDate ? parseISO(maxDate) : undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </label>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            disabled={disabled}
            className={cn(
              'flex items-center gap-2 px-3 h-[38px] rounded-xl border',
              'bg-secondary text-sm font-mono transition-all',
              'hover:border-primary/50 hover:bg-secondary/80',
              'focus:outline-none focus:border-primary/50',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              selected
                ? 'border-border text-foreground'
                : 'border-border text-muted-foreground',
              'min-w-[150px]'
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="flex-1 text-left truncate">
              {selected
                ? format(selected, 'dd/MM/yyyy', { locale: fr })
                : placeholder
              }
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0 shadow-xl border border-border rounded-xl overflow-hidden"
          align="start"
          sideOffset={6}
        >
          <Calendar
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            defaultMonth={selected}
            locale={fr}
            disabled={(date) => {
              // Extract just YYYY-MM-DD from the calendar date to compare properly without timezone shifts
              const calDateStr = format(date, 'yyyy-MM-dd')
              const calDateObj = parseISO(calDateStr)
              
              if (minDateObj && calDateObj < minDateObj) return true
              if (maxDateObj && calDateObj > maxDateObj) return true
              return false
            }}
            initialFocus
            classNames={{
              months: 'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0 p-3',
              month: 'space-y-4',
              caption: 'flex justify-center pt-1 relative items-center',
              caption_label: 'text-sm font-semibold text-foreground capitalize',
              nav: 'space-x-1 flex items-center',
              nav_button: cn(
                'h-7 w-7 bg-transparent p-0 rounded-lg',
                'hover:bg-secondary text-muted-foreground hover:text-foreground',
                'transition-colors inline-flex items-center justify-center'
              ),
              nav_button_previous: 'absolute left-1',
              nav_button_next: 'absolute right-1',
              table: 'w-full border-collapse space-y-1',
              head_row: 'flex',
              head_cell: 'text-muted-foreground rounded-md w-9 font-medium text-[0.8rem] text-center',
              row: 'flex w-full mt-2',
              cell: cn(
                'h-9 w-9 text-center text-sm p-0 relative',
                '[&:has([aria-selected].day-range-end)]:rounded-r-md',
                '[&:has([aria-selected].day-outside)]:bg-accent/50',
                '[&:has([aria-selected])]:bg-accent',
                'first:[&:has([aria-selected])]:rounded-l-md',
                'last:[&:has([aria-selected])]:rounded-r-md',
                'focus-within:relative focus-within:z-20'
              ),
              day: cn(
                'h-9 w-9 p-0 font-normal rounded-lg',
                'hover:bg-secondary hover:text-foreground',
                'aria-selected:opacity-100 transition-colors',
                'inline-flex items-center justify-center text-sm'
              ),
              day_range_end: 'day-range-end',
              day_selected: 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
              day_today: 'bg-accent text-accent-foreground font-semibold',
              day_outside: 'day-outside text-muted-foreground opacity-50',
              day_disabled: 'text-muted-foreground opacity-30 cursor-not-allowed',
              day_hidden: 'invisible',
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

// ── Date Range Picker ──────────────────────────────────────
interface DateRangePickerProps {
  startDate: string       // YYYY-MM-DD
  endDate: string         // YYYY-MM-DD
  onStartChange: (date: string) => void
  onEndChange: (date: string) => void
  startLabel?: string
  endLabel?: string
  maxDate?: string
  minDate?: string
  className?: string
  disabled?: boolean
  // Show as single button with range display (compact mode)
  compact?: boolean
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  startLabel = 'Date début',
  endLabel = 'Date fin',
  maxDate,
  minDate,
  className,
  disabled = false,
  compact = false,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)

  const startDateObj = startDate && isValid(parseISO(startDate))
    ? parseISO(startDate)
    : undefined
  const endDateObj = endDate && isValid(parseISO(endDate))
    ? parseISO(endDate)
    : undefined

  const range: DateRange | undefined = startDateObj
    ? { from: startDateObj, to: endDateObj }
    : undefined

  const handleRangeSelect = (newRange: DateRange | undefined) => {
    if (!newRange) return
    if (newRange.from) {
      onStartChange(format(newRange.from, 'yyyy-MM-dd'))
    }
    if (newRange.to) {
      onEndChange(format(newRange.to, 'yyyy-MM-dd'))
      // Close after range is complete
      setOpen(false)
    }
  }

  const minDateObj = minDate ? parseISO(minDate) : undefined
  const maxDateObj = maxDate ? parseISO(maxDate) : undefined

  // COMPACT MODE — single button shows "01/01/2025 → 12/04/2025"
  if (compact) {
    return (
      <div className={cn('flex flex-col gap-1.5', className)}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              disabled={disabled}
              className={cn(
                'flex items-center gap-2 px-3 h-[38px] rounded-xl border',
                'bg-secondary text-sm font-mono transition-all',
                'hover:border-primary/50 focus:outline-none focus:border-primary/50',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'border-border min-w-[220px]'
              )}
            >
              <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              {startDateObj && endDateObj ? (
                <span className="text-foreground">
                  {format(startDateObj, 'dd/MM/yy', { locale: fr })}
                  {' → '}
                  {format(endDateObj, 'dd/MM/yy', { locale: fr })}
                </span>
              ) : (
                <span className="text-muted-foreground">Sélectionner une période</span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto p-0 shadow-xl border border-border rounded-xl overflow-hidden"
            align="start"
            sideOffset={6}
          >
            <Calendar
              mode="range"
              selected={range}
              onSelect={handleRangeSelect}
              defaultMonth={startDateObj}
              locale={fr}
              numberOfMonths={2}
              disabled={(date) => {
                const calDateStr = format(date, 'yyyy-MM-dd')
                const calDateObj = parseISO(calDateStr)
                if (minDateObj && calDateObj < minDateObj) return true
                if (maxDateObj && calDateObj > maxDateObj) return true
                return false
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>
    )
  }

  // DEFAULT MODE — two separate buttons side by side
  return (
    <div className={cn('flex items-end gap-2', className)}>
      <DatePicker
        value={startDate}
        onChange={(date) => {
          onStartChange(date)
          // If new start > current end, reset end
          if (endDate && date > endDate) {
            onEndChange(date)
          }
        }}
        label={startLabel}
        maxDate={endDate || maxDate}
        minDate={minDate}
        disabled={disabled}
      />

      <span className="text-muted-foreground text-sm mb-2 flex-shrink-0">→</span>

      <DatePicker
        value={endDate}
        onChange={onEndChange}
        label={endLabel}
        minDate={startDate || minDate}
        maxDate={maxDate}
        disabled={disabled}
      />
    </div>
  )
}
