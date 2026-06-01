import { parseOracleOutput, ParsedOracleResponse } from './parser';
// import { GoogleGenAI } from '@google/genai'; // Assuming this is installed

const SYSTEM_PROMPT = `
You are the MANIFOLD Gemini Oracle.
Your task is to generate valid WGSL shader code for a compute pass in a voxel/cellular automata simulation.

### The 6-Channel Material Tensor
The terrain is defined by a 6-channel state tensor (Float32):
- \`density\`: Physical mass.
- \`cohesion\`: Structural integrity (rock=high, sand=low).
- \`permeability\`: Ability for fluids to pass through.
- \`water\`: Mobile fluid mass.
- \`sediment\`: Mobile solid mass.
- \`oxidation\`: Chemical state (age).

### Rules
1. You must output exactly one \`\`\`wgsl block containing the shader.
2. If you mutate \`water\` or \`sand\` using flux mechanics, you must mark \`flux_producer: true\`.
3. You must output exactly one \`\`\`yaml block listing the channels you read from and write to.

Example YAML:
\`\`\`yaml
reads: [water, permeability]
writes: [water, sand]
flux_producer: true
\`\`\`
`;

export class GeminiOracle {
    // private ai: GoogleGenAI;
    
    constructor(apiKey: string) {
        // this.ai = new GoogleGenAI({ apiKey });
        console.log("Initialized Gemini Oracle with System Prompt constraints.");
    }

    public async generateModule(prompt: string): Promise<ParsedOracleResponse> {
        console.log(`[Oracle] Prompting Gemini: "${prompt}"`);
        
        // MOCK API CALL for now, simulating Gemini response
        // const response = await this.ai.models.generateContent({
        //     model: 'gemini-2.5-flash',
        //     contents: prompt,
        //     config: { systemInstruction: SYSTEM_PROMPT }
        // });
        // const text = response.text;
        
        const mockResponseText = `
Here is your requested operator.
\`\`\`wgsl
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    // Oracle generated code here
    let current_water = state.water[idx];
    state.water[idx] = current_water * 0.99; // Evaporation
}
\`\`\`

\`\`\`yaml
reads: [water]
writes: [water]
flux_producer: false
\`\`\`
        `;
        
        return parseOracleOutput(mockResponseText);
    }
}
