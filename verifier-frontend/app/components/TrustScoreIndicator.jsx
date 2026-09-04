export default function TrustScoreIndicator({ score, label = 'Trust Score' }) {
  const getScoreClass = (score) => {
    if (score >= 80) return 'score-high';
    if (score >= 50) return 'score-medium';
    return 'score-low';
  };

  return (
    <div className={`trust-score ${getScoreClass(score)}`}>
      <div className="score-value">{score}</div>
      <div className="score-label">{label}</div>
    </div>
  );
}
