#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main() {
    int contador, soma;
    
    contador = 0;
    soma = 0;
    while (contador < 5) {
        contador = contador + 1;
        soma = soma + contador;
    }
    printf("%d\n", soma);
}