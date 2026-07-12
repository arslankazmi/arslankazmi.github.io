---
title: A Structured Approach to Taking Notes on Scientific Papers
date: 2026-07-22
tags: [note-taking, research, productivity, notebook]
blurb: A note-taking method built for retrieval and comparison — structure each source into a small set of categories, and you can line up any field across everything you've read.
read: 4 min
featured: false
draft: true
---

I'll be going over a particular note-taking strategy that I use in reading scientific papers. It was initially developed in conducting the research for the literature review section of my Master's thesis.

The main problem with reading and trying to understand research papers is writing down key information in a condensed form which is **easy to retrieve** later and **compare** against information gained from other papers. The ideal note-taking method should have a way to take brief, succinct notes while also categorizing them in meaningful chunks. This categorization comes in handy when actually having to compare between different papers. Some people like to just write short summaries of each paper and note down key takeaways and then refer back to these when having to understand and then hopefully write about the research topic as a whole. Others like to annotate papers either in the margins or using their favourite pdf readers. The problem I had with these methods is it still gave me some block of text to read every time I come back to my notes. What if I just want to compare just the datasets used? What if I just need a quick glance at what evaluation metric was used and compare them against each other? I came up with a structured way to organise this information for each paper I read.

## Structure your notes by category

For my research I found that what I needed could be divided into several discrete categories. I used a simple YAML-like nesting syntax to organize these categories in the form of root nodes, with my actual notes per category nested neatly under these roots.

A trimmed, general version of such an entry might look like this:

```
paper-id:
    title:
    concepts:
      -
    thoughts:
      -
    importance:
    references:
      - important:
      - others:
```

The category nodes I found most broadly useful were:

- title : the full title of the paper. I typically enclose this in single quotes.
- concepts : main concepts mentioned throughout the paper.
- thoughts : any thoughts that came to me while reading the paper or while re-reading these notes.
- importance : a discrete value given to the paper relative to others. Can be used later for sorting or grouping. I also like to note reasons for this importance value so I can re-evaluate later.
- references : what references in the paper pertaining to the research topic were given? I like to add two sub-categories here for **important** and **other**.

## Structured entries are easy to compare

Because every paper is written up in the same structured shape, you can compare specific category fields across all the papers read so far to get a good but specific overview of them as a whole. That is the real advantage over a block of prose: you can line up just the one field you care about — the datasets, say, or the metric used — across everything you've read.

## Adapt it to any topic

You can still use a similar structured note-taking approach for any research domain. Instead of using the specific categories above, you can develop your own depending on your domain. Some can carry over, like the **concepts**, **importance**, **thoughts** and especially the **references** section.

I've used this structured, point-form approach to develop a simpler syntax for general note-taking in the same vein. I called it **Another Notetaking Markup Language**, or **ANML**.

## Wrapup

Condensing information from numerous scientific papers can be hard and you can sometimes go overboard with the amount of notes you make. For me, this structured syntax gave me an outline of sorts that I could fill while reading every paper, so I could write down only what was important for later reference or understanding.
