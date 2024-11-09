"use client";

import { useState } from "react";

const FetchData = () => {
  const [flag, setFlag] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const response = await fetch("/api/send-request-01", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      console.error("Error while fetching data:", err);
      setError("Error while fetching data");
    }
  };

  const saveAsMarkdown = () => {
    if (!fileContent) return;

    const blob = new Blob([fileContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "content.md";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col items-start p-4 bg-gray-100 min-h-screen">
      <button
        type="button"
        onClick={fetchData}
        className="px-4 py-2 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75 transition duration-300 mb-4"
      >
        Pobierz Flagę i Zawartość Pliku
      </button>
      {error && (
        <p className="mt-4 text-red-500 font-medium text-center">{error}</p>
      )}
      {flag && (
        <p className="font-bold">
          Flaga:{" "}
          <span className="mt-4 text-green-600 font-semibold text-lg text-center">
            {flag}
          </span>
        </p>
      )}
      {fileContent && (
        <p className="font-bold">
          Zawartość Pliku:{" "}
          <span className="mt-4 text-green-600 font-semibold text-lg text-center">
            {fileContent}
          </span>
        </p>
      )}
      {fileContent && (
        <button
          type="button"
          onClick={saveAsMarkdown}
          className="px-4 py-2 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75 transition duration-300 mt-4"
        >
          Save as Markdown
        </button>
      )}
    </div>
  );
};

export default FetchData;
