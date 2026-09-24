CC ?= cc
CFLAGS ?= -O2 -Wall -Wno-unused-function -Wno-unused-parameter -I vendor/cubiomes -I vendor/cubiomes/loot/cjson

CUBIOMES_SRC = $(shell find vendor/cubiomes -name '*.c')

bin/seedmap: src/seedmap.c $(CUBIOMES_SRC)
	mkdir -p bin
	$(CC) $(CFLAGS) -o $@ src/seedmap.c $(CUBIOMES_SRC) -lm

clean:
	rm -rf bin

.PHONY: clean
