import * as React from "react";
import { useRef, useCallback, useMemo, useState, memo, useEffect } from "react";

export type TokenData<T = unknown> = {
  displayValue: string;
  style?: React.CSSProperties;
  suggestionProps?: T;
}

export type TokenKey = { key: string };

export type SuggestionComponentProps<T> = {
  tokenKey: string;
  displayValue: string;
  suggestionProps?: T;
  hover: boolean;
  onMouseEnter: () => void;
  onMouseDown: () => void;
  onSelect: () => void;
}

function SuggestionComponent<T>({ displayValue, hover, onMouseEnter, onMouseDown, onSelect }: SuggestionComponentProps<T>) {
  return (
    <button
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
      onMouseDown={onMouseDown}
      style={{
        cursor: "pointer",
        border: "none",
        padding: ".5em 1em",
        backgroundColor: hover ? "#333" : "#1a1a1a",
        color: "white"
      }}
    >
      {displayValue}
    </button>
  );
}

const SuggestionListComponent = memo(
  ({ ref, children }: React.PropsWithChildren<React.RefAttributes<Element>>) =>
    <div ref={ref as React.Ref<HTMLDivElement>} style={{
      display: "flex",
      flexDirection: "column",
      width: "min-content",
      maxHeight: "10em",
      overflow: "auto"
    }}>
      {children}
    </div>
);

const defaultTrigger = /^@([^@]*)$/;

type Suggestion = TokenKey & { startPos: number };

function scrollToChild(parent: Element, child: HTMLElement) {
  if (parent.scrollTop < child.offsetTop + child.offsetHeight - parent.clientHeight)
    parent.scrollTop = child.offsetTop + child.offsetHeight - parent.clientHeight;
  else if (parent.scrollTop > child.offsetTop)
    parent.scrollTop = child.offsetTop;
}

export type TokenizedInputProps<T = unknown> = (React.TextareaHTMLAttributes<HTMLTextAreaElement> | React.InputHTMLAttributes<HTMLInputElement>) & {
  tokens: (string | TokenKey)[];
  setTokens: React.Dispatch<React.SetStateAction<(string | TokenKey)[]>>;
  data: Map<string, TokenData<T>>;
  lists: {
    trigger?: RegExp;
    items: string[];
  }[];
  suggestionListComponent?: React.ElementType<React.PropsWithChildren<React.RefAttributes<Element>>>;
  suggestionComponent?: React.ComponentType<SuggestionComponentProps<T>>;
  multiline?: boolean;
  caseSensitive?: boolean;
  missingDataDisplayValue?: string;
  missingDataStyle?: React.CSSProperties;
};

export default function TokenizedInput<SuggestionPropsType = unknown>({
  tokens,
  setTokens,
  data,
  lists,
  suggestionListComponent: SuggestionList = SuggestionListComponent,
  suggestionComponent: Suggestion = SuggestionComponent,
  multiline,
  caseSensitive,
  missingDataDisplayValue = "{missing}",
  missingDataStyle = { color: "red", textDecoration: "red wavy underline" },
  style,
  onKeyDown,
  onScroll,
  onClick,
  onBlur,
  ...props
}: TokenizedInputProps<SuggestionPropsType>) {
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const caretPos = useRef(-1);
  const [insertTokenPos] = useState({
    tokenIndex: -1,
    caretPos: -1
  });
  const [hoveredSuggestion, setHoveredSuggestion] = useState(0);
  const mouseDownOnSuggestion = useRef(false);

  useEffect(() => {
    if (!ref.current)
      return;
    const target = ref.current!;
    const callback = (event: Event) => {
      const e = event as unknown as InputEvent;
      let start = target.selectionStart!;
      let end = target.selectionEnd!;
      let text;
      if (e.data === null) {
        text = "";
        if (start === end)
          if (e.inputType === "deleteContentBackward")
            start--;
          else if (e.inputType === "deleteContentForward")
            end++;
      } else
        text = e.data;
      let total = 0, i = -1, j, head = "", tail = "";
      for (j = 0; j < tokens.length; j++) {
        const token = tokens[j];
        let length;
        if (typeof token === "string")
          length = token.length;
        else
        length = (data.get(token.key)?.displayValue || missingDataDisplayValue).length;
        if (i === -1 && total + length > start) {
          i = j;
          head = target.value.substring(total, start);
        }
        if (total >= end) {
          tail = target.value.substring(end, total);
          break;
        }
        total += length;
      }
      if (j === tokens.length)
        tail = target.value.substring(end);

      let beforeCaretText = head + text;
      if (i === -1)
        i = tokens.length;
      const newTokens = tokens.toSpliced(i, j - i, head + text + tail);
      if (typeof newTokens[i + 1] === "string") {
        (newTokens[i] as string) += newTokens[i + 1];
        newTokens.splice(i + 1, 1);
      }
      if (typeof newTokens[i - 1] === "string") {
        beforeCaretText = newTokens[--i] + beforeCaretText;
        (newTokens[i] as string) += newTokens[i + 1];
        newTokens.splice(i + 1, 1);
      }
      if (!newTokens[i])
        newTokens.splice(i, 1);
      setTokens(newTokens);

      const suggestions = [];
      for (j = 0; j < beforeCaretText.length; j++)
        for (const list of lists) {
          const trigger = list.trigger || defaultTrigger;
          const match = beforeCaretText.substring(j).match(trigger);
          if (match)
            for (const key of list.items) {
              const value = data.get(key)!.displayValue;
              if (caseSensitive) {
                if (value.startsWith(match[1]))
                  suggestions.push({ key, startPos: j });
              } else if (value.toLowerCase().startsWith(match[1].toLowerCase()))
                suggestions.push({ key, startPos: j });
            }
        }
      setSuggestions(suggestions);
      setHoveredSuggestion(0);
      mouseDownOnSuggestion.current = false;

      caretPos.current = start + text.length;
      insertTokenPos.tokenIndex = i;
      insertTokenPos.caretPos = beforeCaretText.length;
    };
    target.addEventListener("beforeinput", callback);
    if (caretPos.current !== -1) {
      const pos = caretPos.current;
      setTimeout(() => target.setSelectionRange(pos, pos), 0);
      caretPos.current = -1;
    }
    return () => target.removeEventListener("beforeinput", callback);
  }, [ref.current, tokens, setTokens, data, missingDataDisplayValue, lists, caseSensitive, setSuggestions, setHoveredSuggestion]);

  const applySuggestion = useCallback((suggestion: Suggestion) => {
    const { tokenIndex, caretPos: cp } = insertTokenPos;
    setTokens(currentTokens => {
      const newTokens = [...currentTokens];
      const text = currentTokens[tokenIndex] as string;
      newTokens[tokenIndex] = text.substring(cp);
      if (!newTokens[tokenIndex])
        newTokens.splice(tokenIndex, 1);
      newTokens.splice(tokenIndex, 0, { key: suggestion.key });
      if (suggestion.startPos !== 0)
        newTokens.splice(tokenIndex, 0, text.substring(0, suggestion.startPos));
      return newTokens;
    });
    ref.current!.focus();
    const displayValue = data.get(suggestion.key)?.displayValue || missingDataDisplayValue;
    caretPos.current = ref.current!.selectionStart! - cp + suggestion.startPos + displayValue.length;
    setSuggestions([]);
    mouseDownOnSuggestion.current = false;
  }, [setTokens, insertTokenPos, data, missingDataDisplayValue]);

  const displayRef = useRef<HTMLDivElement>(null);
  const suggestionListRef = useRef<Element>(null);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement> | React.KeyboardEvent<HTMLInputElement>) => {
    (onKeyDown as React.KeyboardEventHandler)?.(event);
    if (suggestions.length === 0)
      return;
    switch (event.key) {
      case "ArrowUp":
        setHoveredSuggestion(hoveredSuggestion => {
          const index = hoveredSuggestion === 0 ? suggestions.length - 1 : hoveredSuggestion - 1;
          scrollToChild(suggestionListRef.current!, suggestionListRef.current!.children[index] as HTMLElement);
          return index;
        });
        event.preventDefault();
        break;
      case "ArrowDown":
        setHoveredSuggestion(currentIndex => {
          const index = currentIndex === suggestions.length - 1 ? 0 : currentIndex + 1;
          scrollToChild(suggestionListRef.current!, suggestionListRef.current!.children[index] as HTMLElement);
          return index;
        });
        event.preventDefault();
        break;
      case "ArrowLeft":
      case "ArrowRight":
        setSuggestions([]);
        mouseDownOnSuggestion.current = false;
        break;
      case "Escape":
        setSuggestions([]);
        mouseDownOnSuggestion.current = false;
        event.preventDefault();
        break;
      case "Enter":
        applySuggestion(suggestions[hoveredSuggestion]);
        event.preventDefault();
        break;
    }
  }, [onKeyDown, suggestions, hoveredSuggestion, setHoveredSuggestion, setSuggestions, applySuggestion]);

  const handleScroll = useCallback((event: React.UIEvent<HTMLTextAreaElement, UIEvent> | React.UIEvent<HTMLInputElement, UIEvent>) => {
    (onScroll as React.UIEventHandler)?.(event);
    displayRef.current!.scrollLeft = event.currentTarget.scrollLeft;
    displayRef.current!.scrollTop = event.currentTarget.scrollTop;
  }, [onScroll]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLTextAreaElement> | React.MouseEvent<HTMLInputElement>) => {
    (onClick as React.MouseEventHandler)?.(event);
    setSuggestions([]);
    mouseDownOnSuggestion.current = false;
  }, [onClick, setSuggestions]);

  const handleBlur = useCallback((event: React.FocusEvent<HTMLTextAreaElement> | React.FocusEvent<HTMLInputElement>) => {
    if (!mouseDownOnSuggestion.current) {
      (onBlur as React.FocusEventHandler)?.(event);
      setSuggestions([]);
    }
  }, [onBlur, setSuggestions]);

  const [caretSpan, setCaretSpan] = useState<HTMLSpanElement | null>(null);
  const caretRect = useMemo(() => caretSpan?.getBoundingClientRect() || { top: 0, height: 0, left: 0 }, [caretSpan]);

  const {
    borderWidth,
    boxSizing,
    fontFamily,
    fontSize,
    fontStretch,
    fontStyle,
    fontVariant,
    fontWeight,
    letterSpacing,
    lineHeight,
    overflowWrap,
    padding,
    textAlign,
    textDecoration,
    textIndent,
    textTransform,
    whiteSpace,
    wordSpacing
  } = useMemo(
    () => ref.current && getComputedStyle(ref.current), [ref.current]
  ) as React.CSSProperties || {};

  const displayColor = useMemo(() => displayRef.current && getComputedStyle(displayRef.current).color || undefined, [displayRef.current]);

  const { position, left, top, right, bottom, inset, display, width, height, color, ...otherStyle } = useMemo(() => style || {}, [style]);

  useEffect(() => {
    if (ref.current && displayRef.current) {
      const ro = new ResizeObserver(() => {
        const style = displayRef.current?.style;
        if (style) {
          style.width = `calc(${ref.current?.clientWidth || 0}px + ${borderWidth} * 2)`;
          style.height = `calc(${ref.current?.clientHeight || 0}px + ${borderWidth} * 2)`;
        }
      });
      ro.observe(ref.current!);
    }
  }, [borderWidth]);

  const needAppendSpace = useMemo(() => {
    if (tokens.length === 0)
      return false;
    const lastToken = tokens[tokens.length - 1];
    let text;
    if (typeof lastToken === "string")
      text = lastToken;
    else
      text = data.get(lastToken.key)?.displayValue || missingDataDisplayValue;
    return /\s$/.test(text);
  }, [tokens, data, missingDataDisplayValue]);

  const value = useMemo(
    () => tokens.map(token => typeof token === "string" ? token : data.get(token.key)?.displayValue || missingDataDisplayValue).join(""),
    [tokens, data, missingDataDisplayValue]
  );

  return (
    <div style={{ position, left, top, right, bottom, inset, display: display || "inline-block", width, height }}>
      <div style={{ position: "relative" }}>
        {multiline ?
          <textarea
            {...props as React.TextareaHTMLAttributes<HTMLTextAreaElement>}
            ref={ref as React.RefObject<HTMLTextAreaElement>}
            value={value}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            onClick={handleClick}
            onBlur={handleBlur}
            style={{
              fontFamily: "inherit",
              fontSize: "inherit",
              fontStretch: "inherit",
              fontStyle: "inherit",
              fontVariant: "inherit",
              fontWeight: "inherit",
              display: "block",
              boxSizing: "border-box",
              color: "transparent",
              caretColor: displayColor,
              width,
              height,
              ...otherStyle
            }}
          /> :
          <input
            {...props as React.InputHTMLAttributes<HTMLInputElement>}
            ref={ref as React.RefObject<HTMLInputElement>}
            value={value}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            onClick={handleClick}
            onBlur={handleBlur}
            style={{
              fontFamily: "inherit",
              fontSize: "inherit",
              fontStretch: "inherit",
              fontStyle: "inherit",
              fontVariant: "inherit",
              fontWeight: "inherit",
              display: "block",
              boxSizing: "border-box",
              color: "transparent",
              caretColor: displayColor,
              width,
              height,
              ...otherStyle
            }}
          />
        }
        <div
          ref={displayRef}
          className={props.className}
          style={{
            borderWidth,
            boxSizing,
            fontFamily,
            fontSize,
            fontStretch,
            fontStyle,
            fontVariant,
            fontWeight,
            letterSpacing,
            lineHeight,
            overflowWrap,
            padding,
            textAlign,
            textDecoration,
            textIndent,
            textTransform,
            whiteSpace,
            wordSpacing,
            ...otherStyle,
            color,
            pointerEvents: "none",
            position: "absolute",
            width: `calc(${ref.current?.clientWidth || 0}px + ${borderWidth} * 2)`,
            height: `calc(${ref.current?.clientHeight || 0}px + ${borderWidth} * 2)`,
            inset: 0,
            borderStyle: "solid",
            borderColor: "transparent",
            background: "none",
            overflow: "hidden",
            textWrap: "nowrap"
          }}
        >
          {tokens.map((token, i) => {
            if (typeof token === "string") {
              if (i === insertTokenPos.tokenIndex)
                return (
                  <span key={i}>
                    {token.substring(0, insertTokenPos.caretPos)}
                    <span ref={ref => setCaretSpan(ref)} />
                    {token.substring(insertTokenPos.caretPos)}
                  </span>
                );
              return <span key={i}>{token}</span>;
            }
            const t = data.get(token.key);
            if (t)
              return <span key={i} style={t.style}>{t.displayValue}</span>;
            return <span key={i} style={missingDataStyle}>{missingDataDisplayValue}</span>;
          })}
          {needAppendSpace && <>&nbsp;</>}
        </div>
        {suggestions.length !== 0 &&
          <div style={{ position: "fixed", top: caretRect.top + caretRect.height, left: caretRect.left, zIndex: 1 }}>
            <SuggestionList ref={suggestionListRef}>
              {suggestions.map((suggestion, i) => {
                const token = data.get(suggestion.key)!;
                return (
                  <Suggestion
                    key={suggestion.key}
                    tokenKey={suggestion.key}
                    displayValue={token.displayValue}
                    suggestionProps={token.suggestionProps}
                    hover={hoveredSuggestion === i}
                    onMouseEnter={() => setHoveredSuggestion(i)}
                    onMouseDown={() => { mouseDownOnSuggestion.current = true; }}
                    onSelect={() => applySuggestion(suggestion)}
                  />
                );
              })}
            </SuggestionList>
          </div>
        }
      </div>
    </div>
  );
}