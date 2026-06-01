export interface ParsedOracleResponse {
    wgslSource: string;
    reads: string[];
    writes: string[];
    flux_producer: boolean;
}

export function parseOracleOutput(markdownResponse: string): ParsedOracleResponse {
    // 1. Extract WGSL block
    const wgslMatch = markdownResponse.match(/```wgsl\n([\s\S]*?)\n```/);
    if (!wgslMatch) {
        throw new Error("Oracle failed to provide a valid ```wgsl block.");
    }
    const wgslSource = wgslMatch[1];

    // 2. Extract YAML dependency block
    const yamlMatch = markdownResponse.match(/```yaml\n([\s\S]*?)\n```/);
    if (!yamlMatch) {
        throw new Error("Oracle failed to provide a valid ```yaml block for I/O tracking.");
    }
    
    // Very lightweight YAML extraction for the arrays
    const yamlString = yamlMatch[1];
    
    const extractArray = (key: string) => {
        const regex = new RegExp(`${key}:\s*\\[(.*?)\\]`);
        const match = yamlString.match(regex);
        if (!match) return [];
        return match[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(s => s.length > 0);
    };

    const reads = extractArray('reads');
    const writes = extractArray('writes');
    
    const fluxMatch = yamlString.match(/flux_producer:\s*(true|false)/);
    const flux_producer = fluxMatch ? fluxMatch[1] === 'true' : false;

    return {
        wgslSource,
        reads,
        writes,
        flux_producer
    };
}
