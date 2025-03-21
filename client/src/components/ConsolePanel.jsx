import React, { useState, useEffect, useRef } from 'react';
import Panel from './panel/Panel';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Trash, Send, Download } from 'lucide-react';
import { createLogger } from '../lib/utils/logger';

const logger = createLogger('ConsolePanel');

const ConsolePanel = () => {
  const [logs, setLogs] = useState([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const logsEndRef = useRef(null);
  
  // Scroll to bottom when logs change
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);
  
  // Intercept console logs
  useEffect(() => {
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    const originalConsoleInfo = console.info;
    
    // Override console methods
    console.log = (...args) => {
      addLog('log', args);
      originalConsoleLog(...args);
    };
    
    console.error = (...args) => {
      addLog('error', args);
      originalConsoleError(...args);
    };
    
    console.warn = (...args) => {
      addLog('warn', args);
      originalConsoleWarn(...args);
    };
    
    console.info = (...args) => {
      addLog('info', args);
      originalConsoleInfo(...args);
    };
    
    // Add initial log
    addLog('info', ['Console initialized']);
    
    // Restore original console methods on cleanup
    return () => {
      console.log = originalConsoleLog;
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
      console.info = originalConsoleInfo;
    };
  }, []);
  
  const addLog = (type, args) => {
    const timestamp = new Date().toLocaleTimeString();
    const content = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
    
    setLogs(prev => [...prev, { type, content, timestamp }]);
  };
  
  const clearLogs = () => {
    setLogs([]);
    addLog('info', ['Console cleared']);
  };
  
  const handleInputChange = (e) => {
    setInput(e.target.value);
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      executeCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigateHistory(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigateHistory(1);
    }
  };
  
  const navigateHistory = (direction) => {
    const newIndex = historyIndex + direction;
    if (newIndex >= -1 && newIndex < history.length) {
      setHistoryIndex(newIndex);
      if (newIndex === -1) {
        setInput('');
      } else {
        setInput(history[newIndex]);
      }
    }
  };
  
  const executeCommand = () => {
    if (!input.trim()) return;
    
    addLog('command', [`> ${input}`]);
    
    // Add to history
    setHistory(prev => [input, ...prev]);
    setHistoryIndex(-1);
    
    // Try to execute the command
    try {
      const result = eval(input);
      addLog('result', [result]);
    } catch (error) {
      addLog('error', [error.message]);
    }
    
    setInput('');
  };
  
  const downloadLogs = () => {
    const logText = logs.map(log => `[${log.timestamp}] [${log.type}] ${log.content}`).join('\n');
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `console-logs-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const getLogStyle = (type) => {
    switch (type) {
      case 'error':
        return 'text-red-400';
      case 'warn':
        return 'text-yellow-400';
      case 'info':
        return 'text-blue-400';
      case 'command':
        return 'text-green-400 font-bold';
      case 'result':
        return 'text-purple-400';
      default:
        return 'text-foreground';
    }
  };
  
  return (
    <Panel id="console" initialWidth={500} initialHeight={300} minWidth={300} minHeight={200}>
      <div className="flex flex-col h-full">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-medium">Console</h2>
          <div className="flex space-x-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={clearLogs}
              aria-label="Clear console"
              title="Clear console"
              className="h-7 w-7"
            >
              <Trash className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={downloadLogs}
              aria-label="Download logs"
              title="Download logs"
              className="h-7 w-7"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto bg-muted/30 rounded-md p-2 font-mono text-sm mb-2">
          {logs.map((log, index) => (
            <div key={index} className={`mb-1 ${getLogStyle(log.type)}`}>
              <span className="text-muted-foreground text-xs mr-2">[{log.timestamp}]</span>
              <span>{log.content}</span>
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
        
        <div className="flex items-center">
          <Input
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Enter JavaScript command..."
            className="flex-1 font-mono text-sm"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={executeCommand}
            className="ml-2"
            aria-label="Execute command"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Panel>
  );
};

export default ConsolePanel;