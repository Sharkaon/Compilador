import { Tokenizer } from "./tokenizer";

export type Keyword = 
  | 'BRANCHES'
  | 'ITERATE'
  | 'RETURN'
  | 'STRING_TYPE'
  | 'NUMBER_TYPE';

export type Operator =
  | 'ASSIGN'     // '='
  | 'EQ'         // '=='
  | 'NE'         // '!='
  | 'LT'         // '<'
  | 'GT'         // '>'
  | 'LE'         // '<='
  | 'GE'         // '>='
  | 'PLUS'       // '+'
  | 'MINUS'      // '-'
  | 'TIMES'      // '*'
  | 'DIVISION'   // '/'
  | 'ARROW';     // '->'

export type Delimiter = 
  | 'LPAREN'     // '('
  | 'RPAREN'     // ')'
  | 'LBRACE'     // '{'
  | 'RBRACE';    // '}'

export type Punctuation = 
  | 'SEMICOLON'  // ';'
  | 'COMMA'      // ','
  | 'COLON';     // ':'

export type Literal = 
  | 'IDENT'      // identificadores (nomes de variáveis, funções)
  | 'NUMBER'     // números
  | 'STRING';    // strings entre aspas

export type Special = 
  | 'EOF'
  | 'ERROR';

export type TokenType =
  | Keyword
  | Operator
  | Delimiter
  | Punctuation
  | Literal
  | Special;

export type Lexeme = string;

export interface Token {
  type: TokenType;
  lexeme: Lexeme;
  line: number;
  column: number;
}

export class Lexer {
  private line = 1;
  private column = 1;
  private position = 0;
  private tokens: Token[] = [];

  public constructor(private readonly src: string) {}

  // Indica se já consumimos toda a entrada
  private isSourceFinished(): boolean {
    return this.position >= this.src.length;
  }

  // Retorna o caractere atual ou null se a fonte acabou
  private get currentChar(): string | null {
    if (this.isSourceFinished()) return null;
    return this.src[this.position] ?? null;
  }

  // Avança um caractere, atualizando linha/coluna
  private advance(): void {
    if (this.isSourceFinished()) return;
    const ch = this.currentChar!;
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    this.position++;
  }

  // Avança n caracteres
  private advanceBy(n: number): void {
    for (let i = 0; i < n; i++) {
      this.advance();
    }
  }

  // Processa toda a entrada e retorna a lista de tokens
  public processSource(): Token[] {
    this.tokens = [];
    while (!this.isSourceFinished()) {
      const lexeme = this.readCurrentLexeme();
      if (lexeme === null) break;

      const type = Tokenizer.classify(lexeme); // assume que existe
      this.tokens.push({
        type,
        lexeme,
        line: this.line,
        column: this.column - lexeme.length,
      });
    }
    this.tokens.push({
      type: 'EOF',
      lexeme: '',
      line: this.line,
      column: this.column,
    });
    return this.tokens;
  }

  private readCurrentLexeme(): Lexeme | null {
    this.skipWhitespaceAndComments();
    if (this.isSourceFinished()) return null;

    const startPos = this.position;

    if (this.isDigit(this.currentChar)) return this.readDigit(startPos);
    if (this.currentChar === '"') return this.readString(startPos);
    if (this.isLetter(this.currentChar) || this.currentChar === '_') return this.readIdentifier(startPos);

    // Tenta operador de dois caracteres
    const twoCharOp = this.readTwoCharOperator();
    if (twoCharOp !== null) return twoCharOp;

    // Tenta operador/pontuador de um caractere
    const singleChar = this.readSingleCharOperator();
    if (singleChar !== null) return singleChar;

    // Caractere inválido: consome e retorna null (erro)
    throw new Error(`Unexpected character: ${this.currentChar}`);
  }

  private readDigit(startPos: number): Lexeme {
    while (!this.isSourceFinished() && this.isDigit(this.currentChar!)) {
      this.advance();
    }
    // Verifica parte decimal
    if (!this.isSourceFinished() && this.currentChar === '.') {
      const nextChar = this.position + 1 < this.src.length ? this.src[this.position + 1] : null;
      if (!!nextChar && this.isDigit(nextChar)) {
        this.advance(); // consome o ponto
        while (!this.isSourceFinished() && this.isDigit(this.currentChar!)) {
          this.advance();
        }
      }
    }
    return this.src.slice(startPos, this.position);
  }

  private readString(startPos: number): Lexeme {
    this.advance(); // consome aspa inicial
    while (!this.isSourceFinished() && this.currentChar !== '"') {
      if (this.currentChar === '\n') break; // string não pode ter quebra
      this.advance();
    }
    if (!this.isSourceFinished() && this.currentChar === '"') {
      this.advance(); // consome aspa final
    }
    return this.src.slice(startPos, this.position);
  }

  private readIdentifier(startPos: number): Lexeme {
    while (!this.isSourceFinished()) {
      const ch = this.currentChar;
      if (ch === null) break;
      if (this.isLetter(ch) || this.isDigit(ch) || ch === '_') {
        this.advance();
      } else {
        break;
      }
    }
    return this.src.slice(startPos, this.position);
  }

  private readTwoCharOperator(): Lexeme | null {
    if (this.isSourceFinished()) return null;
    const first = this.currentChar!;
    if (this.position + 1 >= this.src.length) return null;
    const second = this.src[this.position + 1];
    const twoChar = first + second;
    const ops = ['->', '==', '!=', '<=', '>='];
    if (ops.includes(twoChar)) {
      this.advanceBy(2);
      return twoChar;
    }
    return null;
  }

  private readSingleCharOperator(): Lexeme | null {
    if (this.isSourceFinished()) return null;
    const ch = this.currentChar!;
    const singleChars = ['=', '<', '>', '+', '-', '*', '/', '(', ')', '{', '}', ';', ',', ':'];
    if (singleChars.includes(ch)) {
      this.advance();
      return ch;
    }
    return null;
  }

  private skipWhitespaceAndComments(): void {
    while (!this.isSourceFinished()) {
      const ch = this.currentChar!;
      if (ch === ' ' || ch === '\t' || ch === '\r') {
        this.advance();
        continue;
      }
      if (ch === '\n') {
        this.advance();
        continue;
      }
      // Comentário // até o fim da linha
      if (ch === '/' && this.position + 1 < this.src.length && this.src[this.position + 1] === '/') {
        while (!this.isSourceFinished() && this.currentChar !== '\n') {
          this.advance();
        }
        continue;
      }
      break;
    }
  }

  private isDigit(ch: string | null): boolean {
    return ch !== null && ch >= '0' && ch <= '9';
  }

  private isLetter(ch: string | null): boolean {
    return ch !== null && ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z'));
  }
}