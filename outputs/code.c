#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int __lambda_0(int x) {
    if (x > 10) {
        return 1;
    }
    else {
        return 0;
    }
}

int main() {
    void* (*verifica)(int);

    int ativo, desligado, resultado;
    
    ativo = 1;
    desligado = 0;
    printf("%d\n", ativo);
    printf("%d\n", desligado);
    verifica = __lambda_0;
    verifica = __lambda_0;
    resultado = verifica(15);
    printf("%d\n", resultado);
    resultado = verifica(5);
    printf("%d\n", resultado);
}