import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { VinculumCompiler } from '../src/compiler/vinculum-compiler';

const specPath = path.resolve(process.cwd(), 'docs/vinculum-spec.md');
const outPath = path.resolve(process.cwd(), 'src/dispatchSequence.ts');

try {
    const fileContents = fs.readFileSync(specPath, 'utf8');
    // Extract yaml from markdown code blocks or just parse directly if it's pure yaml.
    // Our spec has some markdown. Let's try to parse the whole thing, or strip markdown.
    const yamlMatch = fileContents.match(/```yaml\n([\s\S]*?)\n```/);
    const yamlString = yamlMatch ? yamlMatch[1] : fileContents;

    const spec = yaml.load(yamlString) as any;
    
    console.log("Compiling Vinculum Dependency Graph...");
    const compiler = new VinculumCompiler(spec);
    const code = compiler.generateDispatchCode();
    
    fs.writeFileSync(outPath, code, 'utf8');
    console.log(`Successfully generated ${outPath}`);
} catch (e) {
    console.error("Vinculum Compilation Failed:", e);
    process.exit(1);
}
