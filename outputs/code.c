#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int __lambda_0(int n) {
    if (n <= 1) {
        return 1;
    }
    else {
        return n * __lambda_0(n - 1);
    }
}

int main() {
    int (*factorial)(int);

    factorial = __lambda_0;
    factorial = __lambda_0;
    printf("%d\n", factorial(11));
}