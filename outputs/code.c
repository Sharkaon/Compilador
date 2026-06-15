#include <stdio.h>
#include <stdlib.h>
#include <string.h>

char* __lambda_0(int nota) {
    if (nota >= 90) {
        return "A";
    }
    else if (nota >= 80) {
        return "B";
    }
    else if (nota >= 70) {
        return "C";
    }
    else if (nota >= 60) {
        return "D";
    }
    else {
        return "F";
    }
}

int main() {
    char* (*classifica)(int);

    classifica = __lambda_0;
    printf("%s\n", classifica(85));
    printf("%s\n", classifica(95));
    printf("%s\n", classifica(50));
}