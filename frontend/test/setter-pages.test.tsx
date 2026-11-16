import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuestionComposerView } from '../src/pages/setter/QuestionComposerView';
import { SetterAssignmentsView } from '../src/pages/setter/SetterAssignmentsView';
import type { QuestionComposerViewProps, SetterAssignment } from '../src/pages/setter/types';
import type { QuestionImportResult } from '../src/pages/setter/question-import';

const assignment: SetterAssignment = {
  examId: '7',
  title: 'Regional Physics Examination',
  state: 'Collecting',
  sections: [{ sectionId: 0, name: 'Physics', quota: 45, submitted: 12 }],
};

const validQuestion = {
  text: 'Which value is the acceleration due to gravity?',
  options: ['9.8 m/s2', '3.2 m/s2', '1.6 m/s2', '0 m/s2'] as [string, string, string, string],
  correctIndex: 0 as const,
  explanation: 'A sample explanation.',
};

function renderComposer(overrides: Partial<QuestionComposerViewProps> = {}) {
  const props: QuestionComposerViewProps = {
    pageState: 'ready',
    exam: assignment,
    submissions: [],
    importErrors: [],
    progress: { encrypt: 'pending', upload: 'pending', sign: 'pending', confirm: 'pending' },
    onImport: vi.fn(async () => ({ questions: [], errors: [] })),
    onSubmit: vi.fn(async () => {}),
    ...overrides,
  };
  return { ...render(<QuestionComposerView {...props} />), props };
}

describe('FA-09 setter assignments and composer pages', () => {
  it('renders loading, empty, error, permission, and ready assignment states', () => {
    const { rerender } = render(
      <SetterAssignmentsView pageState="loading" assignments={[]} onOpenQuestions={vi.fn()} />,
    );
    expect(screen.getByLabelText('Loading setter assignments')).toBeInTheDocument();

    rerender(<SetterAssignmentsView pageState="empty" assignments={[]} onOpenQuestions={vi.fn()} />);
    expect(screen.getByText('No exams assigned')).toBeInTheDocument();

    const onRetry = vi.fn();
    rerender(
      <SetterAssignmentsView pageState="error" assignments={[]} error={new Error('API unavailable')} onRetry={onRetry} onOpenQuestions={vi.fn()} />,
    );
    expect(screen.getByText('API unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry connection/i }));
    expect(onRetry).toHaveBeenCalledOnce();

    rerender(<SetterAssignmentsView pageState="permission" assignments={[]} onOpenQuestions={vi.fn()} />);
    expect(screen.getByText('Paper Setter role required')).toBeInTheDocument();

    const openQuestions = vi.fn();
    rerender(<SetterAssignmentsView pageState="ready" assignments={[assignment]} onOpenQuestions={openQuestions} />);
    expect(screen.getByText('Physics: 45')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Compose questions' }));
    expect(openQuestions).toHaveBeenCalledWith('7');
  });

  it('renders all composer page states', () => {
    const { rerender } = renderComposer({ pageState: 'loading' });
    expect(screen.getByLabelText('Loading question composer')).toBeInTheDocument();
    rerender(
      <QuestionComposerView
        pageState="empty"
        exam={null}
        submissions={[]}
        importErrors={[]}
        progress={{ encrypt: 'pending', upload: 'pending', sign: 'pending', confirm: 'pending' }}
        onImport={async () => ({ questions: [], errors: [] })}
        onSubmit={async () => {}}
      />,
    );
    expect(screen.getByText('Exam not found')).toBeInTheDocument();
    rerender(
      <QuestionComposerView
        pageState="error"
        exam={null}
        submissions={[]}
        importErrors={[]}
        progress={{ encrypt: 'pending', upload: 'pending', sign: 'pending', confirm: 'pending' }}
        error={new Error('Chain unavailable')}
        onImport={async () => ({ questions: [], errors: [] })}
        onSubmit={async () => {}}
      />,
    );
    expect(screen.getByText('Chain unavailable')).toBeInTheDocument();
    rerender(
      <QuestionComposerView
        pageState="permission"
        exam={null}
        submissions={[]}
        importErrors={[]}
        progress={{ encrypt: 'pending', upload: 'pending', sign: 'pending', confirm: 'pending' }}
        onImport={async () => ({ questions: [], errors: [] })}
        onSubmit={async () => {}}
      />,
    );
    expect(screen.getByText('Paper Setter role required')).toBeInTheDocument();
  });

  it('validates on blur, shows inline duplicate-option errors, and adds a valid question to preview', () => {
    renderComposer();
    const text = screen.getByLabelText('Question text');
    fireEvent.blur(text);
    expect(screen.getByText(/>=10 characters/i)).toBeInTheDocument();

    fireEvent.change(text, { target: { value: validQuestion.text } });
    const optionOne = screen.getByLabelText('Option 1');
    const optionTwo = screen.getByLabelText('Option 2');
    fireEvent.change(optionOne, { target: { value: 'duplicate' } });
    fireEvent.change(optionTwo, { target: { value: ' duplicate ' } });
    fireEvent.blur(optionOne);
    expect(screen.getAllByText(/unique after trimming/i).length).toBeGreaterThan(0);

    fireEvent.change(optionOne, { target: { value: validQuestion.options[0] } });
    fireEvent.change(optionTwo, { target: { value: validQuestion.options[1] } });
    fireEvent.change(screen.getByLabelText('Option 3'), { target: { value: validQuestion.options[2] } });
    fireEvent.change(screen.getByLabelText('Option 4'), { target: { value: validQuestion.options[3] } });
    fireEvent.click(screen.getAllByLabelText('Correct', { selector: 'input' })[0]!);
    fireEvent.change(screen.getByLabelText('Explanation (optional)'), {
      target: { value: validQuestion.explanation },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add question to preview' }));
    expect(screen.getByText(validQuestion.text)).toBeInTheDocument();
  });

  it('accepts a fully valid JSON or CSV import but rejects the entire file when any row fails', async () => {
    const validResult: QuestionImportResult = { questions: [validQuestion], errors: [] };
    const onImport = vi.fn(async () => validResult);
    const first = renderComposer({ onImport });
    const input = screen.getByLabelText('Choose question file');
    fireEvent.change(input, {
      target: { files: [new File(['{}'], 'questions.json', { type: 'application/json' })] },
    });
    await waitFor(() => expect(screen.getByText(validQuestion.text)).toBeInTheDocument());
    expect(onImport).toHaveBeenCalledOnce();
    first.unmount();

    const invalidResult: QuestionImportResult = {
      questions: [],
      errors: [{ row: 3, column: 'correctIndex', problem: 'Choose an index from 0 to 3.' }],
    };
    const second = renderComposer({ onImport: vi.fn(async () => invalidResult) });
    fireEvent.change(screen.getByLabelText('Choose question file'), {
      target: { files: [new File(['bad'], 'questions.csv', { type: 'text/csv' })] },
    });
    await waitFor(() => expect(screen.getByText('Choose an index from 0 to 3.')).toBeInTheDocument());
    expect(screen.getByRole('table').textContent).toContain('correctIndex');
    expect(second.container.querySelector('.question-composer__preview-list')).not.toBeInTheDocument();
  });

  it('previews text safely, shows progress and retries failed submissions without losing the batch', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error('Upload failed')).mockResolvedValueOnce(undefined);
    const { rerender } = renderComposer({ onSubmit });
    fireEvent.change(screen.getByLabelText('Question text'), { target: { value: validQuestion.text } });
    for (let index = 0; index < 4; index += 1) {
      fireEvent.change(screen.getByLabelText(`Option ${index + 1}`), {
        target: { value: validQuestion.options[index] },
      });
    }
    fireEvent.click(screen.getAllByLabelText('Correct', { selector: 'input' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Add question to preview' }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Submit encrypted batch' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(screen.getByText(validQuestion.text)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Submit encrypted batch' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(validQuestion.text)).not.toBeInTheDocument());

    rerender(
      <QuestionComposerView
        pageState="ready"
        exam={assignment}
        submissions={[]}
        importErrors={[]}
        progress={{ encrypt: 'complete', upload: 'complete', sign: 'complete', confirm: 'complete' }}
        onImport={async () => ({ questions: [], errors: [] })}
        onSubmit={async () => {}}
      />,
    );
    expect(screen.getByLabelText('Batch submission progress')).toBeInTheDocument();
  });

  it('renders pending and confirmed history with transaction hash links', () => {
    renderComposer({
      submissions: [
        {
          id: 'pending:0xpending',
          sectionId: 0,
          questionCount: 2,
          hash: `0x${'a'.repeat(64)}`,
          transactionHash: `0x${'b'.repeat(64)}`,
          status: 'pending',
        },
        {
          id: 'confirmed:0xconfirmed',
          sectionId: 0,
          questionCount: 3,
          hash: `0x${'c'.repeat(64)}`,
          transactionHash: `0x${'d'.repeat(64)}`,
          status: 'confirmed',
        },
      ],
    });
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(document.querySelector(`a[href="#submission-0x${'b'.repeat(64)}"]`)).toBeInTheDocument();
  });
});
