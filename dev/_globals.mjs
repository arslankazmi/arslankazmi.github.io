/** Browser-glue entry. esbuild bundles this (+ its imports) into _public/dev/globals.js as an IIFE,
    exposing the pure block/render functions as window globals for the (Babel-compiled) plain view. */
import { devBlocks } from "./blocks.mjs";
import { toMarkdown, pmText, pmHref } from "../shared/render.mjs";
Object.assign(window, { devBlocks, toMarkdown, pmText, pmHref });
