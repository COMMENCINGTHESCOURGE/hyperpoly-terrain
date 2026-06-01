cmake_minimum_required(VERSION 3.19)
project(HyperpolyWindDemo)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Point to your Filament SDK
set(FILAMENT_DIR "${CMAKE_SOURCE_DIR}/../filament" CACHE PATH "Path to Filament SDK")
find_package(Filament REQUIRED PATHS ${FILAMENT_DIR})

# Compile material
add_custom_command(
    OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/materials/wind_vegetation.filamat
    COMMAND ${FILAMENT_DIR}/bin/matc
        -o ${CMAKE_CURRENT_BINARY_DIR}/materials/wind_vegetation.filamat
        ${CMAKE_SOURCE_DIR}/wind_vegetation.mat
    DEPENDS ${CMAKE_SOURCE_DIR}/wind_vegetation.mat
    COMMENT "Compiling wind_vegetation.mat -> .filamat"
)

add_executable(wind_demo main.cpp)

add_custom_target(compile_materials ALL
    DEPENDS ${CMAKE_CURRENT_BINARY_DIR}/materials/wind_vegetation.filamat)
add_dependencies(wind_demo compile_materials)

target_link_libraries(wind_demo PRIVATE filament filament_bluegl)
target_include_directories(wind_demo PRIVATE ${FILAMENT_DIR}/include)
