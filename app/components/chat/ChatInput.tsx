import { useRef, useCallback, useEffect } from "react";

interface ChatInputProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly isLoading: boolean;
}

export function ChatInput({ value, onValueChange, onSubmit, isLoading }: ChatInputProps) {
  const textareaRef = useRef<HTMLElement>(null);

  const handleInput = useCallback(
    (e: Event) => {
      const target = e.currentTarget as HTMLElement & { value: string };
      onValueChange(target.value);
    },
    [onValueChange],
  );

  useEffect(() => {
    const el = textareaRef.current as (HTMLElement & { value: string }) | null;
    if (el && el.value !== value) {
      el.value = value;
    }
  }, [value]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (value.trim() && !isLoading) {
          onSubmit();
        }
      }
    };

    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, [value, isLoading, onSubmit]);

  return (
    <s-box padding="base" border="base none none none">
      <s-stack direction="inline" gap="base" alignItems="end">
        <s-text-area
          ref={textareaRef}
          label="Message"
          labelAccessibilityVisibility="exclusive"
          placeholder="Ask Sidekick anything..."
          value={value}
          rows={1}
          disabled={isLoading || undefined}
          onInput={handleInput}
        />
        <s-button
          variant="primary"
          icon="send"
          onClick={onSubmit}
          disabled={!value.trim() || isLoading || undefined}
          {...(isLoading ? { loading: true } : {})}
        >
          Send
        </s-button>
      </s-stack>
    </s-box>
  );
}
