"use client";

import { useState } from "react";

const TaskS02E01Page = () => {
  const [flag, setFlag] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFetchData = async () => {
    setLoading(true);
    setError(null);
    setFlag(null);

    try {
      const response = await fetch("/api/send-request-S02E01", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      if (data.code !== 0) {
        setError(`Error code: ${data.code}`);
      } else {
        const flagMatch = data.message.match(/{{FLG:(.*?)}}/);
        setFlag(flagMatch ? flagMatch[1] : "No flag returned");
      }
    } catch (err) {
      console.error("Error while fetching data:", err);
      setError("Error while fetching data");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center p-4 bg-gray-100 min-h-screen">
      <button
        type="button"
        onClick={handleFetchData}
        className="px-4 py-2 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75 transition duration-300"
      >
        {loading ? "Processing..." : "Fetch and Process Task S02E01"}
      </button>
      {error && (
        <p className="mt-4 text-red-500 font-medium text-center">{error}</p>
      )}
      {flag && (
        <p className="mt-4 text-green-600 font-semibold text-lg text-center">
          Flag: {flag}
        </p>
      )}
    </div>
  );
};

export default TaskS02E01Page;
