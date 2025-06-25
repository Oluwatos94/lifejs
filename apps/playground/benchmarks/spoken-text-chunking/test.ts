import { SpokenTextTokenizer } from "../../../../packages/life/models/tts/lib/spoken-text-tokenizer";
import { lifeHyphenTokenizer } from "./tokenizers/life-hyphen-tokenizer";

const chunker = new SpokenTextTokenizer();
const text2 = "How beautiful Life is?";
console.log("Life", lifeHyphenTokenizer(text2));
console.log("Final", chunker.chunk(text2));
