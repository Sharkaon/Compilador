import { TypeAnnotation } from "../parser/ast";

export type DataType = 'number' | 'function' | 'string';

export interface FunctionSignature {
  paramTypes: TypeAnnotation[];
  returnType: DataType;
}

export interface SymbolInfo {
  name: string;
  type: DataType;
  functionType?: {
    paramTypes: DataType[];
    returnType: DataType;
    paramNames?: string[]; // nomes dos parâmetros para geração de código
  };
}

export class Scope {
  private symbols: Map<string, SymbolInfo> = new Map();
  public parent: Scope | null = null;

  constructor(parent: Scope | null = null) {
    this.parent = parent;
  }

  declare(name: string, info: SymbolInfo): void {
    if (this.symbols.has(name)) {
      throw new Error(`Variável '${name}' já declarada neste escopo.`);
    }
    this.symbols.set(name, info);
  }

  lookup(name: string): SymbolInfo | null {
    if (this.symbols.has(name)) return this.symbols.get(name)!;
    if (this.parent) return this.parent.lookup(name);
    return null;
  }

  isDeclaredInCurrentScope(name: string): boolean {
    return this.symbols.has(name);
  }
}