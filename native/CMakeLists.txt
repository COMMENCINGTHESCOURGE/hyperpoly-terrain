cmake_minimum_required(VERSION 3.10)
project(TerrainRenderer)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Filament would usually be fetched or found via find_package.
# For CI validation, we will ensure the baseline code compiles standalone first.

add_executable(TerrainRenderer qef_solve_baseline.cpp)
