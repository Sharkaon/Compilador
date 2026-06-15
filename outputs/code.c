#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main() {
    int resultado;
    char* texto[256];
    
    resultado = 10 + 5 * 2 - 8 / 4;
    printf("%d\n", resultado);
    char __temp_0[512];
    snprintf(__temp_0, 512, "%s%d", "Valor: ", resultado);
    strcpy(texto, __temp_0);
    printf("%s\n", texto);
}