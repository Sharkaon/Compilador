#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int __lambda_0(int x, int min, int max) {
    return x >= min && x <= max;
}

int main() {
    void* (*estaNaFaixa)(int, int, int);

    int a, b, resultado;
    
    a = 10;
    b = 5;
    resultado = a > 3 && b < 10;
    printf("%d\n", resultado);
    resultado = a > 100 || b < 10;
    printf("%d\n", resultado);
    resultado = !0;
    printf("%d\n", resultado);
    resultado = !1;
    printf("%d\n", resultado);
    resultado = !(a > 100) && b < 10;
    printf("%d\n", resultado);
    estaNaFaixa = __lambda_0;
    estaNaFaixa = __lambda_0;
    printf("%d\n", estaNaFaixa(15, 10, 20));
    printf("%d\n", estaNaFaixa(5, 10, 20));
}