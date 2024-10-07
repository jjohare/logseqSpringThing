# Simple makefile to build the speedy library.
# This depends upon Sonic, which is assumed to be in a parallel directory.

# To install fftw this might work on your system
#		sudo apt-get install -y fftw-dev

SONIC_DIR=../sonic
FFTW_DIR=../fftw
KISS_DIR=../kissfft

CC=gcc
CPLUSPLUS=g++
CFLAGS=-g -DFFTW -fPIC -I$(SONIC_DIR) -L$(SONIC_DIR) -I$(FFTW_DIR)

all: libspeedy.so speedy_wave

speedy_wave: speedy_wave.cc libspeedy.so $(SONIC_DIR)/libsonic_internal.so
	$(CPLUSPLUS) $(CFLAGS) speedy_wave.cc libspeedy.so $(SONIC_DIR)/libsonic_internal.so -lc -lfftw3 -o speedy_wave

libspeedy.so: soniclib.o speedy.o
	$(CC) -shared soniclib.o speedy.o -o libspeedy.so

soniclib.o: sonic2.h speedy.h

speedy.o: speedy.h

clean:
	rm -f *.o *.so speedy_wave soniclib.o libspeedy.so
	rm -f kiss_fft_test dynamic_time_warping_test sonic_classic_test sonic_test speedy_test

# For the tests that follow, you will probably need to set your LD_LIBRARY_PATH
# to point to the library locations.  For example:
#		export LD_LIBRARY_PATH=/usr/local/lib:../kissfft:../sonic

test: kiss_fft_test dynamic_time_warping_test sonic_classic_test sonic_test speedy_test

kiss_fft_test: kiss_fft_test.cc
	g++ -DKISS_FFT -I../kissfft kiss_fft_test.cc ../kissfft/libkissfft-float.so \
		-o kiss_fft_test -lgtest -DMATCH_MATLAB
	./kiss_fft_test

dynamic_time_warping_test: dynamic_time_warping_test.cc
	g++ dynamic_time_warping_test.cc dynamic_time_warping.cc -lgtest -lglog \
	  -o dynamic_time_warping_test -DMATCH_MATLAB
	./dynamic_time_warping_test

sonic_classic_test: sonic_classic_test.cc
	g++ sonic_classic_test.cc \
	  $(SONIC_DIR)/libsonic.so -lgtest -lglog -I$(SONIC_DIR) \
	  -DMATCH_MATLAB  \
	  -DKISS_FFT -I$(KISS_DIR) $(KISS_DIR)/libkissfft-float.so  \
	  -o sonic_classic_test
	./sonic_classic_test

sonic_test: sonic_test.cc
	g++ sonic_test.cc speedy.c soniclib.c dynamic_time_warping.cc \
	  $(SONIC_DIR)/libsonic_internal.so -lgtest -lglog -I$(SONIC_DIR) -DMATCH_MATLAB \
	  $(KISS_DIR)/libkissfft-float.so -DKISS_FFT -I$(KISS_DIR)  \
		-o sonic_test
	./sonic_test

speedy_test: speedy_test.cc
	 g++ speedy_test.cc speedy.c soniclib.c dynamic_time_warping.cc \
	   $(SONIC_DIR)/libsonic_internal.so -lgtest -lglog -I$(SONIC_DIR) -DMATCH_MATLAB \
	   -I$(KISS_DIR) $(KISS_DIR)/libkissfft-float.so -DKISS_FFT \
	   -o speedy_test
	 ./speedy_test

# Not the following might help you setup the necessary prereqs for this project.
# Do these commands one level up, so you will end up with speedy, sonic,
# kissfft, fftw and googletest in parallel directories

# git clone https://github.com/mborgerding/kissfft.git
# git clone --recursive https://github.com/waywardgeek/sonic.git
# git clone https://github.com/google/speedy.git
# git clone https://github.com/google/googletest.git

# wget http://fftw.org/fftw-3.3.10.tar.gz
# tar xvzf fftw-3.3.10.tar.gz
# cd fftw-3.3.10
# ./configure
# make
# sudo make install

# cd sonic
# make

# sudo apt-get install libgmock-dev