public:: true

- #Public page automatically published
- ## Research History
	- ![image.png](../assets/image_1703366755687_0.png)
- ## Logseq
	- **Logseq**: is very similar to Obsidian, but self hosted and open source. It works on top of plain text files stored in a local system. It supports markdown and Org-mode formatting and allows for hierarchical and networked note-taking. It can be connected to it's mobile app via github.
	- Integration to [[Large language models]] can be OpenAI or local.
		- Compare notion, obsidian, and logseq, using a simply markdown table with coloured dots
	- [ChatGPT Logseq Summarizer (openai.com)](https://chat.openai.com/g/g-3ooWV51Sb-logseq-summarizer)
	-
	- ![Screenshot 2024-01-06 120253.png](../assets/Screenshot_2024-01-06_120253_1706020225813_0.png)
	- ![Screenshot 2024-01-18 103043.png](../assets/Screenshot_2024-01-18_103043_1706020238116_0.png)
	- ![Screenshot 2024-01-18 102807.png](../assets/Screenshot_2024-01-18_102807_1706020247381_0.png)
- ## Others
	- ### Notion
	  collapsed:: true
		- **Notion**: is a versatile paid tool that combines note-taking, task management, databases, and knowledge graphing. Notion allows users to create linked notes and true databases, making is very performant. It has a lot of GPT integration but this costs extra.
		- {{video https://www.youtube.com/watch?v=vFNYUl1pv54}}
		- {{video https://www.youtube.com/watch?v=WnZR7RPH8sA}}
	- ### Obsidian
	  collapsed:: true
		- **Obsidian**: A markdown-based note-taking app designed for knowledge management and building a personal knowledge base. Obsidian's key feature is its ability to create a network of interlinked notes, enabling users to visualize the connections between their thoughts and information.
	- **Roam Research**: This tool is known for its bi-directional linking and its graph overview, which shows how notes are interconnected. Roam is designed to facilitate associative thought, making it easy to see connections between ideas.
	- **Dynalist**: A list-making application that allows for infinite levels of nesting. While primarily a list-maker, it also offers features for linking between lists and items, thereby enabling some degree of knowledge graphing.
	- **TiddlyWiki**: A unique non-linear notebook for capturing, organizing, and sharing complex information. It allows for linking between different Tiddlers (small pieces of information) to create a web of notes.
	- **Zettelkasten Method Tools**: This method emphasizes creating a network of linked notes. Tools like Zettlr or The Archive are designed with the Zettelkasten philosophy in mind, offering features that facilitate linking between notes and creating a knowledge web.
	- **Microsoft OneNote**: A digital notebook that provides a flexible canvas for capturing notes in various formats. It allows for some degree of linking and organizing, suitable for knowledge management.
	- **Evernote**: Known for note-taking, it also provides features for organizing and linking notes, although it's more linear compared to tools like Obsidian or Logseq.
- ![image.png](../assets/image_1706089902931_0.png){:height 812, :width 400}
- # Building a Knowledge Assistant
	- The goal of a knowledge assistant is to create a system that can accept a wide range of tasks, from simple direct queries to complex and ambiguous research questions. It should be capable of delivering outputs that are just as varied, from succinct answers to comprehensive research reports. This flexibility is essential as it allows the system to serve diverse user needs in a personalised manner.
	- In practice, such a system could be used in educational environments to aid learning, in corporate settings to streamline information retrieval, and in research to handle extensive data analysis tasks. This would not only improve efficiency but also enhance the decision-making process by providing quick and accurate information.
	- ### Essential Elements of RAG
		- RAG involves retrieval systems and generative models.
		- Retrieval systems source relevant external information.
		- Generative models create responses using this information.
	- ### Embedding Models in RAG
		- Crucial for converting data into vector embeddings.
		- Facilitates the storage and retrieval of data in vector form.
		- Different types of embeddings for text, images, audio, etc.
	- ### Vector Databases in RAG
		- Store vectorized representations of data.
		- Enable semantic searches beyond keyword matching.
		- Essential for handling large volumes of diverse data types.
	- ### Language Models (LLMs) Integration
		- LLMs like GPT are used for generating responses.
		- They contextualize the retrieved information.
		- LLMs provide the capacity for nuanced and coherent output.
	- ### Data Chunking and Pre-processing
		- Involves organizing data into manageable parts for processing.
		- Effective chunking improves data retrieval accuracy.
		- Overlapping data chunks can enhance context understanding.
	- ### Multimodal Data Handling
		- RAG can process diverse data types (text, image, audio).
		- Presents computational challenges and potential for errors.
		- Requires careful alignment of different data types.
	- ### Optimization and Debugging
		- Involves refining the interaction between components.
		- Debugging is critical to address hallucinations and inaccuracies.
		- Tools for evaluation and observability are essential.
	- ### Applications and Use Cases
		- Suitable for complex tasks requiring external data retrieval.
		- Used in chatbots, customer service interfaces, and information systems.
		- Emerging applications in multimodal contexts (video/image search).
	- ### Current Challenges and Limitations
		- Managing computational costs and complexity.
		- Addressing issues of compounded hallucinations in multimodal RAGs.
		- Balancing storage, computation, and output quality.
	- ## Challenges with Basic RAG (Retrieval-Augmented Generation)
		- **Limitations of Basic RAG:** Traditionally, RAG systems are engineered to enhance search capabilities by integrating retrieval into the generative process. However, they often mimic advanced search engines rather than truly understanding or processing user queries.
		- **Core Challenges:** The primary issues with basic RAG systems include:
			- **Naive Data Processing:** Simple parsing and retrieval that fail to handle the nuances of complex data.
			- **Complex Query Understanding:** Difficulty in interpreting and planning responses to sophisticated or poorly defined questions.
			- **Interaction with Services:** Limited ability to integrate and interact dynamically with external databases or APIs.
			- **Statelessness:** The lack of memory or context across sessions, which is crucial for tasks requiring continuity.
	- ## Advancing Beyond Basic RAG
		- **Enhanced Data Processing:** To transcend the limitations of basic RAG, there is a need for sophisticated data processing techniques. This involves advanced parsing methods that can accurately dissect and structure diverse document types, and enhanced retrieval algorithms capable of understanding and categorizing data more effectively.
		- **Quality of Data:** The adage "garbage in, garbage out" is particularly pertinent here. High-quality, well-structured input data are vital to the output of any LLM application, influencing everything from the accuracy of responses to the system's ability to learn and adapt over time.
		- **Data Processing Components:**
			- **Parsing:** This is crucial for transforming raw, unstructured or semi-structured data into a clean, structured format that is easier to manipulate and understand.
			- **Chunking:** This involves breaking down large texts into manageable pieces, which can then be more easily processed or retrieved.
			- **Indexing:** Efficient indexing is essential for quickly locating information within a large dataset, thereby speeding up the retrieval process.
	- ## Importance of Parsing
		- **Role in LLM Performance:** Effective parsing is not just about extracting text; it's about preserving the structure and meaning of the original document, which includes understanding tables, graphs, and images. This reduces errors and hallucinations (incorrectly generated information), which are common in poorly parsed data.
		- **Impact on User Experience:** By reducing errors and improving the accuracy of the retrieved information, good parsing directly enhances user trust and reliance on the knowledge assistant.
	- ## Advanced Data and Retrieval
		- **Direct Impact on LLMs:** Improved data processing capabilities translate directly into enhanced performance for LLM applications, enabling them to handle a wider variety of tasks more effectively and with greater accuracy.
		- **Critical for Heterogeneous Data:** In environments where data comes in various forms, from structured databases to unstructured social media posts, robust parsing and indexing are essential for maintaining the integrity and usability of the data.
	- ## Single Agent Query Flows
		- **Enhancement Techniques:** Incorporating advanced agentive layers can greatly improve a system’s understanding of queries. This involves sophisticated algorithms for natural language understanding, context retention, and adaptive response generation.
		- **Integration of Functionalities:** Key functionalities include:
			- **Function Calling and Tool Use:** Allows the system to perform specific tasks, such as fetching data from a database or invoking a calculation tool, based on the user's query.
			- **Conversation Memory:** Essential for maintaining context over time, which is crucial for tasks that require ongoing interaction, such as project management or continuous research.
	- ## Multi-Agent Systems
		- **Handling Complex Tasks:** By distributing tasks across multiple specialized agents, a system can handle more complex and diverse tasks efficiently. Each agent can focus on a specific aspect, such as data retrieval, user interaction, or problem-solving.
		- **Reliability and Efficiency:** Specialized agents tend to perform better on tasks within their realm, reducing errors and speeding up the overall process. This can also lead to cost savings and reduced latency in responses.
		- ### Llama Agents: Microservices Approach
			- [The Future of Knowledge Assistants: Jerry Liu (youtube.com)](https://www.youtube.com/watch?v=zeAyuLc_f3Q)
			- **Decentralized Agent Architecture:** Treating agents as separate microservices allows for greater scalability and flexibility. Each agent can be developed, maintained, and scaled independently, enhancing the robustness and resilience of the system.
			- **Orchestration and Communication:** Effective communication and orchestration among these agents are key to handling complex workflows and ensuring that tasks are processed in a coherent and timely manner.
			- #### Demonstrations and Applications
				- **Practical Application of Microservices:** By enhancing a basic RAG pipeline with microservices, the demonstration shows how even simple systems can be scaled up and made more efficient. This approach not only allows for parallel processing but also for handling multiple tasks simultaneously, which is crucial in high-demand environments.
		- ## Microsoft GraphRAG
			- [GraphRAG: New tool for complex data discovery now on GitHub - Microsoft Research](https://www.microsoft.com/en-us/research/blog/graphrag-new-tool-for-complex-data-discovery-now-on-github/) [[Update Cycle]]
		- ## RAGFLOW
			- machinelearn@MLAI:/mnt/mldata/githubs/ragflow/docker$ docker compose up -d
			  title:: RAG Graphs
				- [[Agents]] [[Knowledge Graphing and RAG]]: Definition and Low-code [Implementation by InfiniFlow](https://medium.com/@infiniflowai/agentic-rag-definition-and-low-code-implementation-d0744815029c) introduces advanced RAG systems that require task orchestration mechanisms for complex question-answering tasks. Agentic RAG involves dynamic agent orchestration mechanisms, multi-hop reasoning, and adaptive strategies for various user query intents. The implementation of Self-RAG and Adaptive RAG showcases the capabilities of agentic RAG in improving performance and handling complex queries. Frameworks like Mosaic AI Agent Framework and LangGraph are essential for developing [[Agents]] and task orchestration. Agentic RAG represents a transformation in information processing, offering a wider range of applications in document summarization, customer support, literature chatbots, legal and medical chatbots, and content generation. [RAGFlow](https://github.com/infiniflow/ragflow) supports graph-based task orchestration and no-code editing, continuously improving retrieval-specific operators for agentic RAG applications. [[Could]] [[Knowledge Graphing and RAG]]
		- ## LangChain Graphs
			- Consider langchains agent approach, [[Courses and Training]] here [DLAI - Learning Platform (deeplearning.ai)](https://learn.deeplearning.ai/login?callbackUrl=https%3A%2F%2Flearn.deeplearning.ai%2Fcourses%2Fai-agents-in-langgraph)
				-
- # Misc
	- [Taking RAG apps from POC to Production, Fast - YouTube](https://www.youtube.com/watch?v=WQsN0_eVaEs)
	- [AI-Powered Search: Embedding-Based Retrieval and Retrieval-Augmented Generation (RAG) | by Daniel Tunkelang | Apr, 2024 | Medium](https://dtunkelang.medium.com/ai-powered-search-embedding-based-retrieval-and-retrieval-augmented-generation-rag-cabeaba26a8b)
	- [AutoRAG documentation (marker-inc-korea.github.io)](https://marker-inc-korea.github.io/AutoRAG/index.html)
	- [llmware-ai/llmware: Providing enterprise-grade LLM-based development framework, tools, and fine-tuned models. (github.com)](https://github.com/llmware-ai/llmware) [[Large language models]] [[Infrastructure]] [[Knowledge Graphing and RAG]]
	- [turbopuffer](https://turbopuffer.com/) [[Knowledge Graphing and RAG]] serverless vector database
	- Using [[agents]] over [[Knowledge Graphing and RAG]] [Forget RAG: Embrace agent design for a more intelligent grounded ChatGPT! | by James Nguyen | Nov, 2023 | Medium](https://james-tn.medium.com/forget-rag-embrace-agent-design-for-a-more-intelligent-grounded-chatgpt-6c562d903c61)
	- [[ChatGPT]] threatens the [[Knowledge Graphing and RAG]] model with better capabilities [Chat GPT 4 Turbo for Tech Leaders | Medium](https://medium.com/@sivaad/openai-devday-for-executives-will-gpt-4-turbo-kill-traditional-rag-c82748c8feb9)
	- [CLI tool](https://www.reddit.com/r/ChatGPTCoding/comments/183qetc/made_a_small_cli_tool_to_create_openai_assistants/) to deploy a [[GPT]] model from a directory of data [[Knowledge Graphing and RAG]]
	- [VECTORDB](http://vectordb.com) open source [[Knowledge Graphing and RAG]] database
	- https://nux.ai/guides/chaining-rag-systems [[Knowledge Graphing and RAG]]
	- Instant RAG from directory agent builder for openai [openai instant assistant](https://github.com/davidgonmar/openai_instant_assistant)
	- [[Training and fine tuning]] tiny 1500 line trainer for 8b [[Llama]] [rombodawg/test_dataset_Codellama-3-8B · Hugging Face](https://huggingface.co/rombodawg/test_dataset_Codellama-3-8B)
	- [[Large language models]] memory calculator [LLM RAM Calculator by Ray Fernando](https://llm-calc.rayfernando.ai/)
	- [[Evaluation and leaderboards]] [Ayumi LLM Evaluation (m8geil.de)](https://ayumi.m8geil.de/)
	- [VRAM Calculator (asmirnov.xyz)](https://vram.asmirnov.xyz/)
	- [Local Multi-Agent RAG Superbot using GraphRAG, AutoGen, Ollama, and Chainlit. | by Karthik Rajan | AI Advances (gopubby.com)](https://ai.gopubby.com/microsofts-graphrag-autogen-ollama-chainlit-fully-local-free-multi-agent-rag-superbot-61ad3759f06f) [[Knowledge Graphing and RAG]] [[Knowledge Graphing and RAG]] [[Autogen]] [[Ollama]]
	- [[Knowledge Graphing and RAG]] [Knowledge Graphs - Build, scale, and manage user-facing Retrieval-Augmented Generation applications. (sciphi.ai)](https://r2r-docs.sciphi.ai/cookbooks/knowledge-graph)
		- [SOTA Triples Extraction (sciphi.ai)](https://kg.sciphi.ai/)
		- [SciPhi/Triplex · Hugging Face](https://huggingface.co/SciPhi/Triplex)
	- [win4r/GraphRAG4OpenWebUI: GraphRAG4OpenWebUI integrates Microsoft's GraphRAG technology into Open WebUI, providing a versatile information retrieval API. It combines local, global, and web searches for advanced Q&A systems and search engines. This tool simplifies graph-based retrieval integration in open web environments. (github.com)](https://github.com/win4r/GraphRAG4OpenWebUI) [[Open Webui and Pipelines]] [[Knowledge Graphing and RAG]] [[Knowledge Graphing and RAG]]
	- Elicit search around [[Knowledge Graphing and RAG]]
		- [https://elicit.com/notebook/c4b29508-b134-429d-bda3-88a3b947375f](https://elicit.com/notebook/c4b29508-b134-429d-bda3-88a3b947375f)
		- For instance, this old and simple system
		- [https://elicit.com/notebook/c4b29508-b134-429d-bda3-88a3b947375f#17e74118b78497a92f941b07a460dd99](https://elicit.com/notebook/c4b29508-b134-429d-bda3-88a3b947375f#17e74118b78497a92f941b07a460dd99)
		- gives the following DOI
		- [https://doi.org/10.1145/2381716.2381847](https://doi.org/10.1145/2381716.2381847)
		- which can then go into connected papers
		- [https://www.connectedpapers.com/](https://www.connectedpapers.com/)
		  [https://www.connectedpapers.com/main/995a155fee9afdfacba009c007c884a665ad3055/Visualizing-semantic-web/graph](https://www.connectedpapers.com/main/995a155fee9afdfacba009c007c884a665ad3055/Visualizing-semantic-web/graph)
		- Which immediately reveals a connection to the [[Semantic Web]] , [[Ontology conversation with AIs]] , and OWL, which I am already using.
		- ![KNOWLEDGE EXTRACTION.pdf](../assets/KNOWLEDGE_EXTRACTION_1721153960585_0.pdf) [[Knowledge Graphing and RAG]]
	- [Music Galaxy (spotifytrack.net)](https://galaxy.spotifytrack.net/) [[Music and audio]] [[Knowledge Graphing and RAG]]
	- [[Knowledge Graphing and RAG]] [[Metaverse Ontology]] [[Agentic Mycelia]] [[Agentic Metaverse for Global Creatives]] [[PEOPLE👱]] [[Tom Smoker]] [[Multi Agent RAG scrapbook]]
	- [A New Way to Store Knowledge (breckyunits.com)](https://breckyunits.com/scrollsets.html) [[Knowledge Graphing and RAG]] [[Knowledge Graphing and RAG]] [[Decentralised Web]] [[Could]]
	- [[Knowledge Graphing and RAG]] [GraphRAG: Unlocking LLM discovery on narrative private data - Microsoft Research](https://www.microsoft.com/en-us/research/blog/graphrag-unlocking-llm-discovery-on-narrative-private-data/) [[Knowledge Graphing and RAG]]
	- [topoteretes/cognee: Deterministic LLMs Outputs for AI Applications and AI Agents (github.com)](https://github.com/topoteretes/cognee) [[Knowledge Graphing and RAG]] [[Knowledge Graphing and RAG]] [[Large language models]] also similar [Microsoft Graph RAG paper](https://arxiv.org/pdf/2404.16130) looks like this could work for
	- Day planner with voice input [intellisay](https://www.intellisay.xyz/) [[Knowledge Graphing and RAG]]
	- the [[GPTs and Custom Assistants]] API from [[OpenAI]] now accepts huge numbers of documents and can form the basis for checking my [[Logseq]] [[Knowledge Graphing and RAG]] work against papers. [[SHOULD]]
	- https://github.com/yoheinakajima/MindGraph [[Knowledge Graphing and RAG]] [[Agents]]
		- {{twitter https://twitter.com/yoheinakajima/status/1769019899245158648}}
		-
	- [Introducing Elicit Notebooks! (youtube.com)](https://www.youtube.com/watch?v=DmK-cLdbkvQ) [[Knowledge Graphing and RAG]]
	- [roboflow/supervision: We write your reusable computer vision tools. 💜 (github.com)](https://github.com/roboflow/supervision) [[Knowledge Graphing and RAG]] [[Machine Vision]]
	- [2305.16582.pdf (arxiv.org)](https://arxiv.org/pdf/2305.16582.pdf) [[Knowledge Graphing and RAG]]
	- [🦜🕸️LangGraph | 🦜️🔗 Langchain](https://python.langchain.com/docs/langgraph) [[Knowledge Graphing and RAG]]
	- Sync [[Notion]] with [[Logseq]] for better [[Knowledge Graphing and RAG]] [b-yp/logseq-notion-sync: Sync Logseq content to Notion (github.com)](https://github.com/b-yp/logseq-notion-sync)
	- [[Knowledge Graphing and RAG]] meets [[Large language models]]
		- [[2401.16960] Two Heads Are Better Than One: Integrating Knowledge from Knowledge Graphs and Large Language Models for Entity Alignment (arxiv.org)](https://arxiv.org/abs/2401.16960) [[Knowledge Graphing]] [[Could]]
		- [Answering Questions with Knowledge Graph Embeddings - VectorHub (superlinked.com)](https://hub.superlinked.com/answering-questions-with-knowledge-graph-embeddings)
	- [Gephi - The Open Graph Viz Platform](https://gephi.org/) [[Knowledge Graphing and RAG]]
	- [terraphim/terraphim-ai: This is monorepo for Terraphim AI assistant, no submodules anymore (github.com)](https://github.com/terraphim/terraphim-ai) Private knowledge graph AI search which might support [[Knowledge Graphing and RAG]]
		- [AtomicData.dev (github.com)](https://github.com/atomicdata-dev)
	- Add a tagging system to [[Knowledge Graphing and RAG]]
		- **Status Tags**: #[[fleeting 🪴]], #🌱growing, #[[Projects]], #🌲evergreen
		- **Action Tags**: #🌹NeedsImprovement, #🍂SunsetSoon
		- **Context Tags**: #PEOPLE👱, #📖read/learn
	- [[Diagrams as Code]] page added for the new plugin for [[Knowledge Graphing and RAG]]
	- There's a lot of [[Knowledge Graphing and RAG]] tools like gallery and stuff in [cannibalox/logtools: Logtools: utilities for Logseq (kanban, image gallery, priority matrix, ...) (github.com)](https://github.com/cannibalox/logtools)
	- Publishing graphs from [[Knowledge Graphing and RAG]]
		- [Publishing (Desktop App Only) (logseq.com)](https://docs.logseq.com/?ref=blog.logseq.com#/page/publishing%20(desktop%20app%20only))
		- [[Knowledge Graphing and RAG]] [[github]] action to push a graph out as a single web page including whiteboards [logseq/publish-spa: A github action and CLI to publish logseq graphs as a SPA app](https://github.com/logseq/publish-spa)
			- youtube [Publish graph to github (youtube.com)](https://www.youtube.com/watch?v=nf9MyWRratI)
	-
-