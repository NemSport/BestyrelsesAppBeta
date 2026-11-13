import { formatDateTime } from "@/lib/localization";
import { meetingVoteAnswer, meetingVoteAnswers } from "@/lib/meeting-scheduling";

type Voter = Parameters<typeof meetingVoteAnswer>[0] & {
  comment: string | null;
  option_comments: Record<string, string>;
};

export function MeetingPollResults({
  options,
  voters,
  labels,
}: {
  options: string[];
  voters: Voter[];
  labels: string[];
}) {
  const showComments = voters.some(({ comment }) => comment);
  return (
    <section className="mt-6" aria-label="Deltagernes svar">
      <h2 className="mb-3 font-semibold">Deltagernes svar</h2>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="p-3">Deltager</th>
              {options.map((date) => (
                <th scope="col" className="min-w-28 p-3 font-medium" key={date}>
                  {formatDateTime(date)}
                </th>
              ))}
              {showComments ? (
                <th scope="col" className="min-w-36 p-3">Generel kommentar</th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {voters.map((voter, index) => (
              <tr key={labels[index]}>
                <th scope="row" className="break-words p-3 font-medium">{labels[index]}</th>
                {options.map((date, option) => {
                  const position = option + 1;
                  const answer = meetingVoteAnswer(voter, position);
                  const comment = voter.option_comments[position];
                  return (
                    <td className="p-3 align-top" key={date}>
                      {answer ? meetingVoteAnswers[answer] : null}
                      {comment ? (
                        <p className="mt-1 min-w-36 whitespace-pre-wrap break-words text-muted">
                          {comment}
                        </p>
                      ) : null}
                    </td>
                  );
                })}
                {showComments ? (
                  <td className="whitespace-pre-wrap break-words p-3">{voter.comment}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-line">
            <tr>
              <th scope="row" className="p-3">I alt</th>
              {options.map((date, index) => {
                const answers = voters.map((voter) => meetingVoteAnswer(voter, index + 1));
                return (
                  <td className="p-3" key={date}>
                    <span className="block">{answers.filter((answer) => answer === "yes").length} ja</span>
                    <span className="block">{answers.filter((answer) => answer === "maybe").length} måske</span>
                  </td>
                );
              })}
              {showComments ? <td /> : null}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
