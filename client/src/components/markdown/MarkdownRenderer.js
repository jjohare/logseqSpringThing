import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Copy, Check, Edit, Save, Play, ExternalLink } from 'lucide-react';

// Interactive code block component
const InteractiveCodeBlock = ({ language, code, className }) => {
  const [editable, setEditable] = useState(false);
  const [value, setValue] = useState(code);
  const [copied, setCopied] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [output, setOutput] = useState(null);
  
  const handleEdit = () => {
    setEditable(true);
  };
  
  const handleSave = () => {
    setEditable(false);
  };
  
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  const handleExecute = () => {
    setExecuting(true);
    // Simulate code execution
    setTimeout(() => {
      setOutput(`Executed ${language} code successfully!`);
      setExecuting(false);
    }, 1000);
  };
  
  const isExecutable = ['javascript', 'js', 'typescript', 'ts', 'python', 'py'].includes(language);
  
  return (
    <div className="relative group">
      {editable ? (
        <div className="relative">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full h-full p-4 bg-muted text-sm font-mono rounded-md"
            rows={value.split('\n').length + 1}
          />
          <div className="absolute top-2 right-2 flex space-x-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 bg-background/80"
              onClick={handleSave}
              aria-label="Save"
            >
              <Save className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="relative">
          <SyntaxHighlighter
            style={vscDarkPlus}
            language={language}
            className={cn("rounded-md", className)}
            showLineNumbers={true}
          >
            {value}
          </SyntaxHighlighter>
          
          <div className="absolute top-2 right-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 bg-background/80"
              onClick={handleCopy}
              aria-label="Copy code"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 bg-background/80"
              onClick={handleEdit}
              aria-label="Edit code"
            >
              <Edit className="h-3 w-3" />
            </Button>
            {isExecutable && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 bg-background/80"
                onClick={handleExecute}
                aria-label="Execute code"
                disabled={executing}
              >
                <Play className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      )}
      
      {output && (
        <div className="mt-2 p-3 bg-muted/50 rounded-md border border-border">
          <div className="text-xs font-medium mb-1">Output:</div>
          <div className="text-sm font-mono">{output}</div>
        </div>
      )}
    </div>
  );
};

// Interactive link component
const InteractiveLink = ({ href, children }) => {
  const isExternal = href.startsWith('http');
  
  return (
    <a
      href={href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
      className="text-primary hover:underline inline-flex items-center"
    >
      {children}
      {isExternal && <ExternalLink className="ml-1 h-3 w-3" />}
    </a>
  );
};

const MarkdownRenderer = ({ content, className }) => {
  return (
    <div className={cn("markdown-content prose prose-invert max-w-none", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...props }) => <h1 className="text-2xl font-bold mt-6 mb-4" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-xl font-bold mt-5 mb-3" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-lg font-bold mt-4 mb-2" {...props} />,
          h4: ({ node, ...props }) => <h4 className="text-base font-bold mt-3 mb-2" {...props} />,
          p: ({ node, ...props }) => <p className="my-2" {...props} />,
          a: ({ node, href, ...props }) => <InteractiveLink href={href} {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc pl-6 my-2" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal pl-6 my-2" {...props} />,
          li: ({ node, ...props }) => <li className="my-1" {...props} />,
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-4 border-primary pl-4 italic my-4" {...props} />
          ),
          code: ({ node, inline, className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            const codeContent = String(children).replace(/\n$/, '');
            
            // Check for special comment to make code block interactive
            const isInteractive = codeContent.includes('// @interactive') ||
                                  codeContent.includes('# @interactive');
            
            return !inline ? (
              isInteractive ? (
                <InteractiveCodeBlock
                  language={language}
                  code={codeContent.replace(/\/\/ @interactive|# @interactive/g, '')}
                  className="my-4"
                />
              ) : (
                <SyntaxHighlighter
                  style={vscDarkPlus}
                  language={language}
                  className="rounded-md my-4"
                  showLineNumbers={true}
                  {...props}
                >
                  {codeContent}
                </SyntaxHighlighter>
              )
            ) : (
              <code className="bg-muted px-1 py-0.5 rounded text-sm" {...props}>
                {children}
              </code>
            );
          },
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full divide-y divide-border" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => <thead className="bg-muted" {...props} />,
          tbody: ({ node, ...props }) => <tbody className="divide-y divide-border" {...props} />,
          tr: ({ node, ...props }) => <tr className="hover:bg-muted/50" {...props} />,
          th: ({ node, ...props }) => (
            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider" {...props} />
          ),
          td: ({ node, ...props }) => <td className="px-4 py-2 text-sm" {...props} />,
          hr: ({ node, ...props }) => <hr className="my-6 border-border" {...props} />,
          img: ({ node, ...props }) => (
            <img
              className="max-w-full h-auto rounded-md my-4 hover:opacity-90 transition-opacity"
              loading="lazy"
              {...props}
              alt={props.alt || ''}
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;