"use client";

import { useState } from 'react';

const FetchData = () => {
  const [flag, setFlag] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const response = await fetch('/api/send-request-01', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        setError(`Server error: ${response.status}`);
        return;
      }

      const data = await response.json().catch(() => {
        throw new Error("Invalid JSON response");
      });

      if (data.error) {
        setError(data.error);
      } else {
        setFlag(data.flag);
        setFileContent(data.fileContent);
        setError(null);
      }
    } catch (err) {
      console.error('Error while fetching data:', err);
      setError('Error while fetching data');
    }
  };

  const saveAsMarkdown = () => {
    if (!fileContent) return;

    const blob = new Blob([fileContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = 'content.md';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <button onClick={fetchData}>Pobierz Flagę i Zawartość Pliku</button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {flag && <p>Flaga: {flag}</p>}
      {fileContent && <p>Zawartość Pliku: {fileContent}</p>}
      {fileContent && (
        <button onClick={saveAsMarkdown}>Save as Markdown</button>
      )}
    </div>
  );
}

export default FetchData;
