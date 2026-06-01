/*
 * HYPERPOLY-TERRAIN II — Filament Native Wind Vegetation Demo
 * 10,000 instanced grass blades with per-instance wind deformation.
 * 6-channel material tensor drives cohesion-modulated sway.
 *
 * Build: cmake .. -DFILAMENT_DIR=/path/to/filament && make -j
 */

#include <filament/Engine.h>
#include <filament/Renderer.h>
#include <filament/Scene.h>
#include <filament/View.h>
#include <filament/Camera.h>
#include <filament/Material.h>
#include <filament/MaterialInstance.h>
#include <filament/RenderableManager.h>
#include <filament/VertexBuffer.h>
#include <filament/IndexBuffer.h>
#include <filament/TransformManager.h>
#include <filament/LightManager.h>
#include <filament/Viewport.h>
#include <filament/SwapChain.h>
#include <filament/Texture.h>
#include <filament/TextureSampler.h>

#include <utils/EntityManager.h>

#include <SDL2/SDL.h>

#include <vector>
#include <fstream>
#include <cmath>
#include <cstdlib>
#include <ctime>

using namespace filament;
using namespace filament::math;

constexpr int WINDOW_WIDTH  = 1280;
constexpr int WINDOW_HEIGHT = 720;
constexpr int GRASS_COUNT   = 10000;
constexpr int TENSOR_SIZE   = 256;

// ── File I/O ──────────────────────────────────────────────────
std::vector<uint8_t> loadFile(const std::string& path) {
    std::ifstream file(path, std::ios::binary);
    if (!file) throw std::runtime_error("Failed to open file: " + path);
    return std::vector<uint8_t>(
        (std::istreambuf_iterator<char>(file)),
        std::istreambuf_iterator<char>());
}

// ── Grass blade mesh (cone) ───────────────────────────────────
struct GrassMesh {
    VertexBuffer* vb = nullptr;
    IndexBuffer*  ib = nullptr;
    size_t indexCount = 0;
};

GrassMesh createGrassMesh(Engine* engine) {
    constexpr int slices = 8;
    constexpr float height = 0.35f;
    constexpr float radius = 0.04f;

    struct Vertex { float position[3]; float normal[3]; };

    std::vector<Vertex> vertices;
    std::vector<uint16_t> indices;

    vertices.push_back({{0.0f, height, 0.0f}, {0.0f, 1.0f, 0.0f}});   // apex
    vertices.push_back({{0.0f, 0.0f, 0.0f}, {0.0f, -1.0f, 0.0f}});     // base center

    for (int i = 0; i < slices; i++) {
        float a = (i / (float)slices) * 2.0f * M_PI;
        vertices.push_back({{cos(a) * radius, 0.0f, sin(a) * radius}, {0.0f, -1.0f, 0.0f}});
    }
    for (int i = 0; i < slices; i++) {
        uint16_t b = 2 + i, n = 2 + (i + 1) % slices;
        indices.push_back(0); indices.push_back(b); indices.push_back(n);       // side
        indices.push_back(1); indices.push_back(n); indices.push_back(b);       // base
    }

    GrassMesh m;
    m.vb = VertexBuffer::Builder()
        .vertexCount(vertices.size()).bufferCount(1)
        .attribute(VertexAttribute::POSITION, 0, VertexBuffer::AttributeType::FLOAT3, 0, sizeof(Vertex))
        .attribute(VertexAttribute::TANGENTS, 0, VertexBuffer::AttributeType::FLOAT3, offsetof(Vertex, normal), sizeof(Vertex))
        .build(*engine);
    m.vb->setBufferAt(*engine, 0, VertexBuffer::BufferDescriptor(vertices.data(), vertices.size() * sizeof(Vertex), nullptr));

    m.ib = IndexBuffer::Builder().indexCount(indices.size()).bufferType(IndexBuffer::IndexType::USHORT).build(*engine);
    m.ib->setBuffer(*engine, IndexBuffer::BufferDescriptor(indices.data(), indices.size() * sizeof(uint16_t), nullptr));

    m.indexCount = indices.size();
    return m;
}

// ── Per‑instance data ─────────────────────────────────────────
struct InstanceData {
    float worldPos[3];     // CUSTOM0 — instance world position
    float materialIdx;     // CUSTOM1 — index into material tensor texture
};

// ── Material tensor texture (1D, RGBA32F) ─────────────────────
Texture* createTensorTexture(Engine* engine, int count) {
    std::vector<float> data(count * 4);
    for (int i = 0; i < count; i++) {
        data[i * 4 + 0] = 0.3f + (rand() / (float)RAND_MAX) * 0.6f;  // cohesion
        data[i * 4 + 1] = 1.0f;                                        // yield
        data[i * 4 + 2] = 0.5f;                                        // density
        data[i * 4 + 3] = 0.2f + (rand() / (float)RAND_MAX) * 0.6f;   // moisture
    }

    auto* tex = Texture::Builder()
        .width(count).height(1).levels(1)
        .format(Texture::InternalFormat::RGBA32F)
        .usage(Texture::Usage::SAMPLEABLE)
        .build(*engine);
    tex->setImage(*engine, 0, PixelBufferDescriptor(
        data.data(), data.size() * sizeof(float),
        PixelDataFormat::RGBA, PixelDataType::FLOAT));
    return tex;
}

// ── Main ──────────────────────────────────────────────────────
int main(int argc, char* argv[]) {
    srand((unsigned)time(nullptr));

    // SDL2 OpenGL context
    SDL_Init(SDL_INIT_VIDEO);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 4);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 1);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_CORE);
    SDL_GL_SetAttribute(SDL_GL_DEPTH_SIZE, 24);
    SDL_GL_SetAttribute(SDL_GL_STENCIL_SIZE, 8);

    SDL_Window* window = SDL_CreateWindow(
        "Hyperpoly-Terrain II — Wind Vegetation",
        SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
        WINDOW_WIDTH, WINDOW_HEIGHT,
        SDL_WINDOW_OPENGL | SDL_WINDOW_RESIZABLE);
    SDL_GLContext glCtx = SDL_GL_CreateContext(window);
    SDL_GL_MakeCurrent(window, glCtx);

    // Filament engine
    Engine* engine = Engine::create(Engine::Backend::OPENGL);
    SwapChain* swapChain = engine->createSwapChain(window);
    Renderer* renderer = engine->createRenderer();
    Scene* scene = engine->createScene();
    View* view = engine->createView();

    // Material
    auto matBytes = loadFile("materials/wind_vegetation.filamat");
    Material* material = Material::Builder()
        .package(matBytes.data(), matBytes.size())
        .build(*engine);
    MaterialInstance* matInstance = material->createInstance();

    // Tensor texture
    Texture* tensorTex = createTensorTexture(engine, TENSOR_SIZE);
    TextureSampler sampler(TextureSampler::MinFilter::NEAREST, TextureSampler::MagFilter::NEAREST);
    matInstance->setParameter("materialTensor", tensorTex, sampler);

    // Grass mesh
    auto grass = createGrassMesh(engine);

    // Instances
    std::vector<InstanceData> instances(GRASS_COUNT);
    for (int i = 0; i < GRASS_COUNT; i++) {
        float angle = (rand() / (float)RAND_MAX) * 2.0f * M_PI;
        float radius = 15.0f + (rand() / (float)RAND_MAX) * 90.0f;
        instances[i] = {
            cos(angle) * radius, 0.0f, sin(angle) * radius,
            (float)(i % TENSOR_SIZE)
        };
    }

    VertexBuffer* instBuf = VertexBuffer::Builder()
        .vertexCount(GRASS_COUNT).bufferCount(1)
        .attribute(VertexAttribute::CUSTOM0, 0, VertexBuffer::AttributeType::FLOAT3,
                   0, sizeof(InstanceData))
        .attribute(VertexAttribute::CUSTOM1, 0, VertexBuffer::AttributeType::FLOAT,
                   offsetof(InstanceData, materialIdx), sizeof(InstanceData))
        .build(*engine);
    instBuf->setBufferAt(*engine, 0,
        VertexBuffer::BufferDescriptor(instances.data(), instances.size() * sizeof(InstanceData), nullptr));

    // Renderable
    auto& rm = engine->getRenderableManager();
    RenderableManager::Builder builder(1);
    builder.setGeometry(0, RenderableManager::PrimitiveType::TRIANGLES,
                        grass.vb, grass.ib, 0, grass.indexCount);
    builder.setMaterial(0, matInstance);
    builder.setInstances(GRASS_COUNT);
    builder.setInstancedData(instBuf, 0);
    auto renderable = rm.create(builder.build(*engine));
    scene->addEntity(renderable);

    // Sun
    auto& lm = engine->getLightManager();
    auto sun = utils::EntityManager::get().create();
    LightManager::Builder(LightManager::Type::SUN)
        .color({1.0f, 0.95f, 0.85f}).intensity(100000.0f)
        .direction({0.3f, 0.8f, 0.4f}).castShadows(true)
        .build(*engine, sun);
    scene->addEntity(sun);

    // Camera
    auto camEnt = utils::EntityManager::get().create();
    auto& tm = engine->getTransformManager();
    tm.create(camEnt, TransformManager::Instance{});
    tm.setTransform(tm.getInstance(camEnt), mat4f::translation(float3{0.0f, 2.0f, 15.0f}));
    Camera* camera = engine->createCamera(camEnt);
    view->setCamera(camera);
    view->setViewport({0, 0, WINDOW_WIDTH, WINDOW_HEIGHT});
    view->setScene(scene);

    // Main loop
    float time = 0.0f;
    bool running = true;
    SDL_Event ev;

    while (running) {
        while (SDL_PollEvent(&ev)) {
            if (ev.type == SDL_QUIT) running = false;
            if (ev.type == SDL_KEYDOWN && ev.key.keysym.sym == SDLK_ESCAPE) running = false;
        }

        time += 0.016f;
        matInstance->setParameter("time", time);
        matInstance->setParameter("windDirection", float3{1.0f, 0.0f, 0.3f});
        matInstance->setParameter("windStrength", 1.2f);
        matInstance->setParameter("noiseScale", 0.15f);
        matInstance->setParameter("cameraPosition", float3{0.0f, 2.0f, 15.0f});
        matInstance->setParameter("lodDistance", 60.0f);

        if (renderer->beginFrame(swapChain)) {
            renderer->render(view);
            renderer->endFrame();
        }
    }

    // Teardown
    engine->destroy(renderable);
    engine->destroy(instBuf);
    engine->destroy(grass.vb);
    engine->destroy(grass.ib);
    engine->destroy(tensorTex);
    engine->destroy(matInstance);
    engine->destroy(material);
    engine->destroy(camEnt);
    engine->destroy(sun);
    engine->destroy(view);
    engine->destroy(scene);
    engine->destroy(renderer);
    engine->destroy(swapChain);
    Engine::destroy(&engine);

    SDL_GL_DeleteContext(glCtx);
    SDL_DestroyWindow(window);
    SDL_Quit();
    return 0;
}
