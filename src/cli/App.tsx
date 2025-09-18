import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import type { CommandDefinition, CommandResult, ParsedCommand, PromptPlan, PromptSequence } from './types.js';
import type { ExecutionContext } from './types.js';
import { formatResult } from './output.js';

interface AppProps {
  initialCommand: ParsedCommand;
  definition: CommandDefinition;
  context: ExecutionContext;
}

export const App: React.FC<AppProps> = ({ initialCommand, definition, context }) => {
  const app = useApp();
  const [command, setCommand] = useState<ParsedCommand>(initialCommand);
  const [sequence, setSequence] = useState<PromptSequence | null>(null);
  const [promptIndex, setPromptIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'initial' | 'prompts' | 'running' | 'done' | 'error'>('initial');
  const [result, setResult] = useState<CommandResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (definition.preparePrompts) {
          const seq = await definition.preparePrompts(command, context);
          if (!cancelled && seq && seq.prompts.length > 0) {
            setSequence(seq);
            setStatus('prompts');
            return;
          }
        }
        if (!cancelled) setStatus('running');
      } catch (err) {
        if (!cancelled) {
          setError(err as Error);
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== 'running') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await definition.run(command, context);
        if (!cancelled) {
          setResult(res);
          setStatus('done');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err as Error);
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, command, context, definition]);

  useEffect(() => {
    if (status === 'done') {
      process.exitCode = result?.success === false ? 1 : 0;
      setTimeout(() => app.exit(), 30);
    }
    if (status === 'error') {
      process.exitCode = 1;
      setTimeout(() => app.exit(), 30);
    }
  }, [status, result, app]);

  if (status === 'error' && error) {
    return (
      <Box flexDirection="column">
        <Text color="red">✗ {error.message}</Text>
      </Box>
    );
  }

  if (status === 'prompts' && sequence) {
    const prompt = sequence.prompts[promptIndex];
    if (!prompt) {
      try {
        const updated = sequence.apply(answers);
        setSequence(null);
        setCommand(updated);
        setStatus('running');
      } catch (err) {
        setError(err as Error);
        setStatus('error');
      }
      return <Text />;
    }
    return (
      <PromptStep
        prompt={prompt}
        onSubmit={(value) => {
          const nextAnswers = { ...answers, [prompt.id]: value };
          setAnswers(nextAnswers);
          setPromptIndex((index) => index + 1);
        }}
      />
    );
  }

  if (status === 'running') {
    return (
      <Box flexDirection="column">
        <Text>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>{' '}
          Executing {command.verb}…
        </Text>
      </Box>
    );
  }

  if (status === 'done' && result) {
    const output = formatResult(result, command);
    return (
      <Box flexDirection="column">
        {result.message && (
          <Text color={result.success ? 'green' : 'yellow'}>{result.message}</Text>
        )}
        {output && (!result.message || output !== result.message) && (
          <Text>{output}</Text>
        )}
      </Box>
    );
  }

  return <Text />;
};

interface PromptStepProps {
  prompt: PromptPlan;
  onSubmit: (value: string) => void;
}

const PromptStep: React.FC<PromptStepProps> = ({ prompt, onSubmit }) => {
  switch (prompt.type) {
    case 'text':
      return <TextPrompt prompt={prompt} onSubmit={onSubmit} />;
    case 'select':
      return <SelectPrompt prompt={prompt} onSubmit={onSubmit} />;
    case 'confirm':
      return <ConfirmPrompt prompt={prompt} onSubmit={onSubmit} />;
    default:
      return <Text color="red">Unsupported prompt type</Text>;
  }
};

const TextPrompt: React.FC<PromptStepProps> = ({ prompt, onSubmit }) => {
  const [value, setValue] = useState(prompt.defaultValue ?? '');
  const [error, setError] = useState<string | null>(null);
  return (
    <Box flexDirection="column">
      <Text>{prompt.message}</Text>
      <TextInput
        value={value}
        onChange={(next) => {
          setValue(next);
          setError(null);
        }}
        onSubmit={(val) => {
          const validation = prompt.validate ? prompt.validate(val) : true;
          if (validation !== true) {
            setError(typeof validation === 'string' ? validation : 'Invalid value');
            return;
          }
          onSubmit(val);
        }}
      />
      {error && <Text color="red">{error}</Text>}
    </Box>
  );
};

const SelectPrompt: React.FC<PromptStepProps> = ({ prompt, onSubmit }) => {
  const items = useMemo(
    () => prompt.choices?.map((choice) => ({ label: choice.label, value: choice.value })) ?? [],
    [prompt.choices]
  );
  return (
    <Box flexDirection="column">
      <Text>{prompt.message}</Text>
      <SelectInput items={items} onSelect={(item) => onSubmit(String(item.value))} />
    </Box>
  );
};

const ConfirmPrompt: React.FC<PromptStepProps> = ({ prompt, onSubmit }) => {
  useInput((input, key) => {
    if (key.return) {
      onSubmit('no');
    } else if (input.toLowerCase() === 'y') {
      onSubmit('yes');
    } else if (input.toLowerCase() === 'n') {
      onSubmit('no');
    }
  });
  return (
    <Box flexDirection="column">
      <Text>{prompt.message} (y/N)</Text>
    </Box>
  );
};
