import { TokenType } from "./lexer";

export class Tokenizer {
  public static classify(lexeme: string): TokenType {
    switch (lexeme) {
      case 'branches': return 'BRANCHES';
      case 'iterate':   return 'ITERATE';
      case 'enquanto':  return 'ENQUANTO';
      case 'return':    return 'RETURN';
      case 'number':    return 'NUMBER_TYPE';
      case 'string':    return 'STRING_TYPE';
      case 'boolean':   return 'BOOLEAN_TYPE';
      case 'true':      return 'TRUE';
      case 'false':     return 'FALSE';
    }
    if (Tokenizer.isNumberLexeme(lexeme)) return 'NUMBER';
    if (Tokenizer.isStringLexeme(lexeme)) return 'STRING';
    switch (lexeme) {
      case '=':  return 'ASSIGN';
      case '==': return 'EQ';
      case '!=': return 'NE';
      case '<':  return 'LT';
      case '>':  return 'GT';
      case '<=': return 'LE';
      case '>=': return 'GE';
      case '+':  return 'PLUS';
      case '-':  return 'MINUS';
      case '*':  return 'TIMES';
      case '/':  return 'DIVISION';
      case '->': return 'ARROW';
    }
    switch (lexeme) {
      case '(': return 'LPAREN';
      case ')': return 'RPAREN';
      case '{': return 'LBRACE';
      case '}': return 'RBRACE';
    }
    switch (lexeme) {
      case ';': return 'SEMICOLON';
      case ',': return 'COMMA';
      case ':': return 'COLON';
    }
    return 'IDENT';
    // Implementation for classifying lexemes
  }

  private static isNumberLexeme(lexeme: string): boolean {
    return /^\d+(\.\d+)?$/.test(lexeme);
  }

  private static isStringLexeme(lexeme: string): boolean {
    return lexeme.startsWith('"') && lexeme.endsWith('"') && lexeme.length >= 2;
  }
}
