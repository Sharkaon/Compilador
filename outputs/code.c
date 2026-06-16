#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int __lambda_0(int (*f)(int), int x) {
    return f(x);
}

int __lambda_1(int n) {
    return n * 2;
}

int main() {
    int (*aplica)(int (*)(int), int);

    int (*dobro)(int);

    int resultado, dobro;
    
    aplica = __lambda_0;
    dobro = __lambda_1;
    resultado = aplica(dobro, 21);
    printf("%d\n", resultado);
}