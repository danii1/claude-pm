import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';

interface Task {
  summary: string;
  description: string;
  type: 'Story' | 'Task' | 'Bug' | 'Epic';
}

interface InteractiveState {
  step: 'source-type' | 'source-input' | 'custom' | 'epic' | 'style' | 'issue-type' | 'confirm' | 'done';
  sourceType?: 'figma' | 'log' | 'prompt';
  sourceContent?: string;
  customInstructions?: string;
  epicKey?: string;
  promptStyle: 'pm' | 'technical';
  issueType: string;
  decompose: boolean;
  tasks: Task[];
}

const InteractiveForm: React.FC<{ onComplete: (config: InteractiveState) => void }> = ({ onComplete }) => {
  const { exit } = useApp();
  const [state, setState] = useState<InteractiveState>({
    step: 'source-type',
    promptStyle: 'pm',
    issueType: 'Story',
    decompose: false,
    tasks: [],
  });
  const [input, setInput] = useState('');

  useInput((inputChar, key) => {
    // Ctrl+C exits the app
    if (key.ctrl && inputChar === 'c') {
      exit();
      return;
    }

    // Escape goes to previous step
    if (key.escape) {
      handleEscape();
      return;
    }

    if (key.return) {
      handleEnter();
      return;
    }

    if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
      return;
    }

    // Auto-advance on number keys for specific steps
    if (!key.ctrl && !key.meta && inputChar) {
      // For source-type, auto-advance when pressing 1, 2, or 3
      if (state.step === 'source-type' && ['1', '2', '3'].includes(inputChar)) {
        const sourceType = inputChar === '1' ? 'figma' : inputChar === '2' ? 'log' : 'prompt';
        setState(prev => ({ ...prev, sourceType, step: 'source-input' }));
        setInput('');
        return;
      }

      // For issue-type, auto-advance when pressing 1, 2, 3, or 4
      if (state.step === 'issue-type' && ['1', '2', '3', '4'].includes(inputChar)) {
        const types = ['Story', 'Task', 'Bug', 'Epic'];
        const issueType = types[parseInt(inputChar) - 1]!;
        setState(prev => ({ ...prev, issueType, step: 'style' }));
        setInput('');
        return;
      }

      // For style, auto-advance when pressing 1 or 2
      if (state.step === 'style' && ['1', '2'].includes(inputChar)) {
        const promptStyle = inputChar === '1' ? 'pm' : 'technical';
        setState(prev => ({ ...prev, promptStyle, decompose: false, step: 'confirm' }));
        setInput('');
        return;
      }

      // For confirm, auto-advance when pressing y or n
      if (state.step === 'confirm' && ['y', 'n'].includes(inputChar.toLowerCase())) {
        if (inputChar.toLowerCase() === 'y') {
          setState(prev => ({ ...prev, step: 'done' }));
          onComplete(state);
        } else {
          setState(prev => ({ ...prev, step: 'source-type' }));
          setInput('');
        }
        return;
      }

      setInput(prev => prev + inputChar);
    }
  });

  const handleEscape = () => {
    // Navigate to previous step and restore previous input value
    switch (state.step) {
      case 'source-input':
        setInput('');
        setState(prev => ({ ...prev, step: 'source-type' }));
        break;
      case 'custom':
        setInput(state.sourceContent || '');
        setState(prev => ({ ...prev, step: 'source-input' }));
        break;
      case 'epic':
        setInput(state.customInstructions || '');
        setState(prev => ({ ...prev, step: 'custom' }));
        break;
      case 'issue-type':
        setInput(state.epicKey || '');
        setState(prev => ({ ...prev, step: 'epic' }));
        break;
      case 'style':
        setInput('');
        setState(prev => ({ ...prev, step: 'issue-type' }));
        break;
      case 'confirm':
        setInput('');
        setState(prev => ({ ...prev, step: 'style' }));
        break;
      // For source-type and done, do nothing (can't go back further)
    }
  };

  const handleEnter = () => {
    const trimmedInput = input.trim();

    switch (state.step) {
      case 'source-type':
        if (['1', '2', '3'].includes(trimmedInput)) {
          const sourceType = trimmedInput === '1' ? 'figma' : trimmedInput === '2' ? 'log' : 'prompt';
          setState(prev => ({ ...prev, sourceType, step: 'source-input' }));
          setInput('');
        }
        break;

      case 'source-input':
        if (trimmedInput) {
          setState(prev => ({ ...prev, sourceContent: trimmedInput, step: 'custom' }));
          setInput('');
        }
        break;

      case 'custom':
        setState(prev => ({
          ...prev,
          customInstructions: trimmedInput || undefined,
          step: 'epic'
        }));
        setInput('');
        break;

      case 'epic':
        setState(prev => ({
          ...prev,
          epicKey: trimmedInput || undefined,
          step: 'issue-type'
        }));
        setInput('');
        break;

      case 'issue-type':
        if (['1', '2', '3', '4'].includes(trimmedInput)) {
          const types = ['Story', 'Task', 'Bug', 'Epic'];
          const issueType = types[parseInt(trimmedInput) - 1]!;
          setState(prev => ({ ...prev, issueType, step: 'style' }));
          setInput('');
        } else if (trimmedInput) {
          setState(prev => ({ ...prev, issueType: trimmedInput, step: 'style' }));
          setInput('');
        }
        break;

      case 'style':
        if (['1', '2'].includes(trimmedInput)) {
          const promptStyle = trimmedInput === '1' ? 'pm' : 'technical';
          // Skip decompose step for now - always set to false
          setState(prev => ({ ...prev, promptStyle, decompose: false, step: 'confirm' }));
          setInput('');
        }
        break;

      // Decompose step disabled for now
      // case 'decompose':
      //   if (['y', 'n', ''].includes(trimmedInput.toLowerCase())) {
      //     const decompose = trimmedInput.toLowerCase() === 'y';
      //     setState(prev => ({ ...prev, decompose, step: 'confirm' as const }));
      //     setInput('');
      //   }
      //   break;

      case 'confirm':
        if (['y', 'n', ''].includes(trimmedInput.toLowerCase())) {
          if (trimmedInput.toLowerCase() === 'y' || trimmedInput === '') {
            setState(prev => ({ ...prev, step: 'done' }));
            onComplete(state);
          } else {
            setState(prev => ({ ...prev, step: 'source-type' }));
            setInput('');
          }
        }
        break;
    }
  };

  const renderStep = () => {
    switch (state.step) {
      case 'source-type':
        return (
          <Box flexDirection="column" paddingY={1}>
            <Text bold>Select source type:</Text>
            <Text>1. Figma design URL</Text>
            <Text>2. Error log / Bug report</Text>
            <Text>3. Free-form prompt</Text>
          </Box>
        );

      case 'source-input':
        const label = state.sourceType === 'figma'
          ? 'Enter Figma URL:'
          : state.sourceType === 'log'
            ? 'Enter error log or bug description:'
            : 'Enter your requirements:';
        return (
          <Box flexDirection="column" paddingY={1}>
            <Text bold>{label}</Text>
            <Box borderStyle="single" borderColor="gray" paddingX={1}>
              <Text color="cyan">&gt; {input}</Text>
            </Box>
          </Box>
        );

      case 'custom':
        return (
          <Box flexDirection="column" paddingY={1}>
            <Text bold>Custom instructions (optional, press Enter to skip):</Text>
            <Text dimColor>Additional requirements or focus areas</Text>
            <Text dimColor>Example: "Focus on accessibility" or "Prioritize performance"</Text>
            <Box borderStyle="single" borderColor="gray" paddingX={1}>
              <Text color="cyan">&gt; {input}</Text>
            </Box>
          </Box>
        );

      case 'epic':
        return (
          <Box flexDirection="column" paddingY={1}>
            <Text bold>Epic key (optional, press Enter to skip):</Text>
            <Text dimColor>Example: PROJ-123</Text>
            <Box borderStyle="single" borderColor="gray" paddingX={1}>
              <Text color="cyan">&gt; {input}</Text>
            </Box>
          </Box>
        );

      case 'issue-type':
        return (
          <Box flexDirection="column" paddingY={1}>
            <Text bold>Select issue type:</Text>
            <Text>1. Story (default)</Text>
            <Text>2. Task</Text>
            <Text>3. Bug</Text>
            <Text>4. Epic</Text>
            <Text dimColor>Or type a custom issue type name</Text>
          </Box>
        );

      case 'style':
        return (
          <Box flexDirection="column" paddingY={1}>
            <Text bold>Select prompt style:</Text>
            <Text>1. PM style (user stories, acceptance criteria)</Text>
            <Text>2. Technical style (includes technical considerations)</Text>
          </Box>
        );

      // Decompose step disabled for now
      // case 'decompose':
      //   return (
      //     <Box flexDirection="column" paddingY={1}>
      //       <Text bold>Decompose into subtasks? (y/N):</Text>
      //       <Box paddingTop={1}>
      //         <Text color="cyan">&gt; {input}</Text>
      //       </Box>
      //     </Box>
      //   );

      case 'confirm': {
        const sourceLabel = state.sourceType === 'figma'
          ? 'URL'
          : state.sourceType === 'log'
            ? 'Error Log'
            : 'Requirements';
        return (
          <Box flexDirection="column" paddingY={1}>
            <Text bold color="green">Review your configuration:</Text>
            <Box paddingLeft={2} flexDirection="column" paddingY={1}>
              <Text bold>Source Type:</Text>
              <Text color="cyan">{state.sourceType}</Text>

              {state.sourceContent && (
                <Box flexDirection="column" paddingTop={1}>
                  <Text bold>{sourceLabel}:</Text>
                  <Text color="cyan">{state.sourceContent}</Text>
                </Box>
              )}

              {state.customInstructions && (
                <Box flexDirection="column" paddingTop={1}>
                  <Text bold>Custom Instructions:</Text>
                  <Text color="cyan">{state.customInstructions}</Text>
                </Box>
              )}

              {state.epicKey && (
                <Box flexDirection="column" paddingTop={1}>
                  <Text bold>Epic:</Text>
                  <Text color="cyan">{state.epicKey}</Text>
                </Box>
              )}

              <Box flexDirection="column" paddingTop={1}>
                <Text bold>Issue Type:</Text>
                <Text color="cyan">{state.issueType}</Text>
              </Box>

              <Box flexDirection="column" paddingTop={1}>
                <Text bold>Prompt Style:</Text>
                <Text color="cyan">{state.promptStyle}</Text>
              </Box>
            </Box>
            <Text bold>Continue? (Y/n)</Text>
          </Box>
        );
      }

      case 'done':
        return (
          <Box flexDirection="column" paddingY={1}>
            <Text bold color="green">✓ Configuration complete!</Text>
            <Text dimColor>Starting task creation...</Text>
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">📋 Claude PM - Interactive Mode</Text>
        <Text dimColor>ESC: Back • Ctrl+C: Exit</Text>
      </Box>
      {renderStep()}
    </Box>
  );
};

export async function runInteractiveMode(): Promise<InteractiveState> {
  return new Promise((resolve, reject) => {
    let completed = false;

    const { waitUntilExit, unmount } = render(
      <InteractiveForm
        onComplete={(config) => {
          completed = true;
          // Wait a brief moment to show the completion message
          setTimeout(() => {
            unmount();
            resolve(config);
          }, 500);
        }}
      />
    );

    // Handle when user exits without completing
    waitUntilExit().then(() => {
      if (!completed) {
        reject(new Error('Interactive mode cancelled'));
      }
    });
  });
}
