import { DataType, Globals } from "csstype";
import {
  useRef,
  useCallback,
  useMemo,
  useState,
  memo,
  useEffect,
  CSSProperties,
  ComponentType,
  Dispatch,
  ElementType,
  FocusEvent,
  FocusEventHandler,
  InputHTMLAttributes,
  KeyboardEvent,
  KeyboardEventHandler,
  MouseEvent,
  MouseEventHandler,
  PropsWithChildren,
  Ref,
  RefAttributes,
  RefObject,
  SetStateAction,
  TextareaHTMLAttributes,
  UIEventHandler
} from "react";

export interface TokenWithKey { key: string }

export type Token = string | TokenWithKey;

export type TokenData<T = unknown> = {
  displayText: string;
  style?: CSSProperties;
  suggestionProps?: T;
};

export type SuggestionComponentProps<T> = {
  tokenKey: string;
  displayText: string;
  suggestionProps?: T;
  hover: boolean;
  onMouseEnter: () => void;
  onMouseDown: () => void;
  onSelect: () => void;
};

function SuggestionComponent<T>({ displayText, hover, onMouseEnter, onMouseDown, onSelect }: SuggestionComponentProps<T>) {
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
      {displayText}
    </button>
  );
}

const SuggestionListComponent = memo(
  ({ ref, children }: PropsWithChildren<RefAttributes<Element>>) =>
    <div ref={ref as Ref<HTMLDivElement>} style={{
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

type Suggestion = TokenWithKey & { startPos: number };

function scrollToChild(parent: Element, child: HTMLElement) {
  if (parent.scrollTop < child.offsetTop + child.offsetHeight - parent.clientHeight)
    parent.scrollTop = child.offsetTop + child.offsetHeight - parent.clientHeight;
  else if (parent.scrollTop > child.offsetTop)
    parent.scrollTop = child.offsetTop;
}

export type TokenizedInputProps<T = unknown> = (TextareaHTMLAttributes<HTMLTextAreaElement> | InputHTMLAttributes<HTMLInputElement>) & {
  tokens: Token[];
  setTokens: Dispatch<SetStateAction<Token[]>>;
  data: { [key: string]: TokenData<T> };
  lists: {
    trigger?: RegExp;
    items: string[];
  }[];
  suggestionListComponent?: ElementType<PropsWithChildren<RefAttributes<Element>>>;
  suggestionComponent?: ComponentType<SuggestionComponentProps<T>>;
  multiline?: boolean;
  caseSensitive?: boolean;
  missingDataText?: string;
  missingDataStyle?: CSSProperties;
};

type PasteData = { tokens: Token[], length: number };

export default function TokenizedInput<SuggestionPropsType = unknown>({
  tokens,
  setTokens,
  data,
  lists,
  suggestionListComponent: SuggestionList = SuggestionListComponent,
  suggestionComponent: Suggestion = SuggestionComponent,
  multiline,
  caseSensitive,
  missingDataText = "{missing}",
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
    const updateTokensAndSuggestions = (
      head: string,
      insertTokens: Token[],
      length: number,
      tail: string,
      start: number,
      i: number,
      j: number
    ) => {
      let beforeCaretText;
      const lastToken = insertTokens[insertTokens.length - 1];
      if (typeof lastToken === "string") {
        beforeCaretText = lastToken;
        insertTokens[insertTokens.length - 1] += tail;
        if (insertTokens.length === 1)
          beforeCaretText = head + beforeCaretText;
      } else {
        if (tail)
          insertTokens.push(tail);
        beforeCaretText = "";
      }
      if (typeof insertTokens[0] === "string")
        insertTokens[0] = head + insertTokens[0];
      else if (head)
        insertTokens.unshift(head);
      const newTokens = tokens.toSpliced(i, j - i, ...insertTokens);
      if (typeof lastToken === "string" && typeof newTokens[i + insertTokens.length] === "string") {
        (newTokens[i + insertTokens.length - 1] as string) += newTokens[i + insertTokens.length];
        newTokens.splice(i + insertTokens.length, 1);
      }
      if (typeof newTokens[i] === "string" && typeof newTokens[i - 1] === "string") {
        if (insertTokens.length === 1)
          beforeCaretText = newTokens[i - 1] + beforeCaretText;
        (newTokens[i - 1] as string) += newTokens[i];
        newTokens.splice(i, 1);
        i--;
      }
      insertTokenPos.tokenIndex = i + insertTokens.length - 1;
      if (!newTokens[i]) {
        newTokens.splice(i, 1);
        insertTokenPos.tokenIndex--;
      }
      setTokens(newTokens);

      const suggestions = [];
      for (const list of lists) {
        const trigger = list.trigger ?? defaultTrigger;
        const matches = [];
        for (j = 0; j < beforeCaretText.length; j++)
          matches.push(beforeCaretText.substring(j).match(trigger));
        for (const key of list.items)
          for (j = 0; j < beforeCaretText.length; j++)
            if (matches[j]) {
              const value = data[key].displayText;
              if (caseSensitive) {
                if (value.startsWith(matches[j]![1])) {
                  suggestions.push({ key, startPos: j });
                  break;
                }
              } else if (value.toLowerCase().startsWith(matches[j]![1].toLowerCase())) {
                suggestions.push({ key, startPos: j });
                break;
              }
            }
      }
      setSuggestions(suggestions);
      setHoveredSuggestion(0);
      mouseDownOnSuggestion.current = false;

      caretPos.current = start + length;
      insertTokenPos.caretPos = beforeCaretText.length;
    };
    const beforeInputCallback = (event: Event) => {
      const e = event as InputEvent;
      if (e.inputType === "deleteByDrag" || e.inputType === "insertFromDrop")
        return; // I have no idea to get the insertion position
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
          length = (data[token.key]?.displayText ?? missingDataText).length;
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
      if (i === -1)
        i = tokens.length;
      updateTokensAndSuggestions(head, [text], text.length, tail, start, i, j);
    };
    const copyCallback = (event: Event) => {
      event.preventDefault();
      const start = target.selectionStart!;
      const end = target.selectionEnd!;
      if (start === end)
        return;
      const result = [];
      let length = 0;
      let total = 0;
      for (const token of tokens) {
        let text;
        if (typeof token === "string")
          text = token;
        else
          text = data[token.key]?.displayText ?? missingDataText;
        const tokenTextLength = text.length;
        if (total < start) {
          if (total + tokenTextLength > start) {
            text = text.substring(start - total, Math.min(tokenTextLength, end - total));
            result.push(text);
            length += text.length;
          }
        } else if (total < end) {
          if (total + tokenTextLength <= end) {
            if (typeof token === "string" && typeof result[result.length - 1] === "string")
              result[result.length - 1] += token;
            else
              result.push(token);
            length += text.length;
          } else {
            text = text.substring(0, end - total);
            if (typeof result[result.length - 1] === "string")
              result[result.length - 1] += text;
            else
              result.push(text);
            length += text.length;
          }
        } else
          break;
        total += tokenTextLength;
      }
      (event as ClipboardEvent).clipboardData!.setData("application/json", JSON.stringify({ tokens: result, length } as PasteData));
    };
    const cutCallback = (event: Event) => {
      copyCallback(event);
      beforeInputCallback({ data: "" } as InputEvent);
    };
    const pasteCallback = (event: Event) => {
      const pasteDataStr = (event as ClipboardEvent).clipboardData!.getData("application/json");
      if (!pasteDataStr)
        return;
      let pasteData: PasteData;
      try {
        pasteData = JSON.parse(pasteDataStr);
        if (!pasteData.tokens || !pasteData.length)
          return;
        event.preventDefault();
        const start = target.selectionStart!;
        const end = target.selectionEnd!;
        let total = 0, i = -1, j, head = "", tail = "";
        for (j = 0; j < tokens.length; j++) {
          const token = tokens[j];
          let length;
          if (typeof token === "string")
            length = token.length;
          else
            length = (data[token.key]?.displayText ?? missingDataText).length;
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
        if (i === -1)
          i = tokens.length;
        updateTokensAndSuggestions(head, pasteData.tokens, pasteData.length, tail, start, i, j);
      } catch {}
    };
    target.addEventListener("beforeinput", beforeInputCallback);
    target.addEventListener("copy", copyCallback);
    target.addEventListener("cut", cutCallback);
    target.addEventListener("paste", pasteCallback);
    if (caretPos.current !== -1) {
      const pos = caretPos.current;
      setTimeout(() => target.setSelectionRange(pos, pos));
      caretPos.current = -1;
    }
    return () => {
      target.removeEventListener("beforeinput", beforeInputCallback);
      target.removeEventListener("copy", copyCallback);
      target.removeEventListener("cut", cutCallback);
      target.removeEventListener("paste", pasteCallback);
    };
  }, [tokens, setTokens, data, missingDataText, lists, caseSensitive, setSuggestions, setHoveredSuggestion, insertTokenPos]);

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
    const displayText = data[suggestion.key]?.displayText || missingDataText;
    caretPos.current = ref.current!.selectionStart! - cp + suggestion.startPos + displayText.length;
    setSuggestions([]);
    mouseDownOnSuggestion.current = false;
  }, [setTokens, insertTokenPos, data, missingDataText]);

  const displayRef = useRef<HTMLDivElement>(null);
  const suggestionListRef = useRef<Element>(null);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement> | KeyboardEvent<HTMLInputElement>) => {
    (onKeyDown as KeyboardEventHandler)?.(event);
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
    (onScroll as UIEventHandler)?.(event);
    displayRef.current!.scrollLeft = event.currentTarget.scrollLeft;
    displayRef.current!.scrollTop = event.currentTarget.scrollTop;
  }, [onScroll]);

  const handleClick = useCallback((event: MouseEvent<HTMLTextAreaElement> | MouseEvent<HTMLInputElement>) => {
    (onClick as MouseEventHandler)?.(event);
    setSuggestions([]);
    mouseDownOnSuggestion.current = false;
  }, [onClick, setSuggestions]);

  const handleBlur = useCallback((event: FocusEvent<HTMLTextAreaElement> | FocusEvent<HTMLInputElement>) => {
    if (!mouseDownOnSuggestion.current) {
      (onBlur as FocusEventHandler)?.(event);
      setSuggestions([]);
    }
  }, [onBlur, setSuggestions]);

  const [caretSpan, setCaretSpan] = useState<HTMLSpanElement | null>(null);
  const suggestionListContainerRef = useRef<HTMLDivElement>(null);
  if (suggestionListContainerRef.current && caretSpan) {
    const caretRect = caretSpan.getBoundingClientRect();
    suggestionListContainerRef.current.style.left = `${caretRect.left}px`;
    suggestionListContainerRef.current.style.top = `${caretRect.bottom}px`;
  }

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
  } = (ref.current ? getComputedStyle(ref.current) : {}) as CSSProperties;

  const displayColor = displayRef.current ? getComputedStyle(displayRef.current).color as Globals | DataType.Color | "auto" : undefined;

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
      return () => ro.disconnect();
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
      text = data[lastToken.key]?.displayText || missingDataText;
    return /\s$/.test(text);
  }, [tokens, data, missingDataText]);

  const value = useMemo(
    () => tokens.map(token => typeof token === "string" ? token : data[token.key]?.displayText || missingDataText).join(""),
    [tokens, data, missingDataText]
  );

  return (
    <div style={{ position, left, top, right, bottom, inset, display: display || "inline-block", width, height }}>
      <div style={{ position: "relative" }}>
        {multiline ?
          <textarea
            {...props as TextareaHTMLAttributes<HTMLTextAreaElement>}
            ref={ref as RefObject<HTMLTextAreaElement>}
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
            {...props as InputHTMLAttributes<HTMLInputElement>}
            ref={ref as RefObject<HTMLInputElement>}
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
            const t = data[token.key];
            if (t)
              return <span key={i} style={t.style}>{t.displayText}</span>;
            return <span key={i} style={missingDataStyle}>{missingDataText}</span>;
          })}
          {needAppendSpace && <>&nbsp;</>}
        </div>
        {suggestions.length !== 0 &&
          <div ref={suggestionListContainerRef} style={{ position: "fixed", zIndex: 1 }}>
            <SuggestionList ref={suggestionListRef}>
              {suggestions.map((suggestion, i) => {
                const token = data[suggestion.key];
                return (
                  <Suggestion
                    key={suggestion.key}
                    tokenKey={suggestion.key}
                    displayText={token.displayText}
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
