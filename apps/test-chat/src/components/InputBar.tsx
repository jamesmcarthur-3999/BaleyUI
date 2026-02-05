import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InputBarProps {
  onSend: (message: string) => void
  disabled?: boolean
  isLoading?: boolean
}

export function InputBar({ onSend, disabled, isLoading }: InputBarProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [input])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (trimmed && !disabled && !isLoading) {
      onSend(trimmed)
      setInput('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="border-t border-border bg-background px-4 py-4">
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex max-w-3xl items-end gap-3"
      >
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={disabled || isLoading}
            rows={1}
            className={cn(
              'w-full resize-none rounded-lg border border-input bg-background px-4 py-3',
              'text-sm placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'max-h-[200px]'
            )}
          />
        </div>
        <button
          type="submit"
          disabled={!input.trim() || disabled || isLoading}
          className={cn(
            'flex h-[46px] w-[46px] items-center justify-center rounded-lg',
            'bg-primary text-primary-foreground',
            'transition-colors hover:bg-primary/90',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </button>
      </form>
      <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-muted-foreground">
        Powered by BaleyBots • Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  )
}
