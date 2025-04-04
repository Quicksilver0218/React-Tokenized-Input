# React-Tokenized-Input &middot; [![npm (scoped)](https://img.shields.io/npm/v/@quicksilver0218/react-tokenized-input)](https://www.npmjs.com/package/@quicksilver0218/react-tokenized-input) [![npm bundle size (scoped)](https://img.shields.io/bundlephobia/min/@quicksilver0218/react-tokenized-input@)](https://bundlephobia.com/package/@quicksilver0218/react-tokenized-input) [![GitHub](https://img.shields.io/github/license/quicksilver0218/react-tokenized-input)](https://github.com/Quicksilver0218/react-tokenized-input/blob/main/LICENSE)
A React input field component that tokenizes and autocompletes the input.

## Installation
```
npm i @quicksilver0218/react-tokenized-input
```

## Usage
```ts
import TokenizedInput, { Token } from "@quicksilver0218/react-tokenized-input";

const MyComponent = (/* ... */) => {
  const [tokens, setTokens] = useState<Token[]>([]);
  // ...
  return (
    // ...
    
    <TokenizedInput
      tokens={tokens}
      setTokens={setTokens}
      data={}
      lists={[
        {
          trigger: /* ... */,
          items: /* ... */,
        },
        // more lists go here...
      ]}
      suggestionListComponent={}
      suggestionComponent={}
      multiline
      caseSensitive
      missingDataText={}
      missingDataStyle={}
      // input or textarea props...
    />
    
    // ...
  );
};
```

### Types
```ts
interface TokenWithKey { key: string }

type Token = string | TokenWithKey;

type TokenData<T = unknown> = {
  displayText: string;
  style?: CSSProperties;
  suggestionProps?: T;
};

type SuggestionComponentProps<T> = {
  tokenKey: string;
  displayText: string;
  suggestionProps?: T;
  hover: boolean;
  onMouseEnter: () => void;
  onMouseDown: () => void;
  onSelect: () => void;
};
```

### Properties
| Property | Type | Description |
| --- | --- | --- |
| tokens | Token[] | The tokens. |
| setTokens | Dispatch<SetStateAction<Token[]>> | The setting tokens action dispatcher.
| data | { [key: string]: TokenData\<T> } | The dictionary of all tokens.
| lists | Array | The suggestion lists.
| lists[].trigger? | RegExp | The triggering condition of showing the suggestions in the list. Default `/^@([^@]*)$/`.
| lists[].items | string[] | The key of the suggestion tokens in the list.
| suggestionListComponent? | ElementType<PropsWithChildren<RefAttributes\<Element>>> | The suggestion list component. A default component will be used if it is not given.
| suggestionComponent? | ComponentType<SuggestionComponentProps\<T>> | The suggestion list item component. A default component will be used if it is not given.
| multiline? | boolean | If `true`, `textarea` will be used. Otherwise, `input` will be used. Default `false`.
| caseSensitive? | boolean | If `true`, the input will be matched with the token display text in case-sensitive mode. Otherwise, they are matched in case-insensitive mode. Default `false`.
| missingDataText? | string | The text to be shown when the key of a token does not exist in `data`. Default `"{missing}"`.
| missingDataStyle? | CSSProperties | The style to be applied on `missingDataText`. Default `{ color: "red", textDecoration: "red wavy underline" }`.

## Examples
- Basic: [CodeSandbox](https://codesandbox.io/p/sandbox/silly-euler-z453f3)
- Highly customization with Material UI: [CodeSandbox](https://codesandbox.io/p/sandbox/mzhrzr)
