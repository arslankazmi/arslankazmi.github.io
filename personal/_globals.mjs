/** Browser-glue entry. esbuild bundles this (+ its imports) into _public/personal/globals.js as an
    IIFE, exposing the pure block/render functions as window globals for the (Babel-compiled) plain view. */
import { personalBlocks } from "./blocks.mjs";
import { toMarkdown, pmText, pmHref } from "../shared/render.mjs";
Object.assign(window, { personalBlocks, toMarkdown, pmText, pmHref });
