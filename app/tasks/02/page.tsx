"use client";

import { useState } from "react";

const FetchData = () => {
  const [flag, setFlag] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const response = await fetch("/api/send-request-02", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setFlag(data.flag || "No flag found");
        setError(null);
      }
    } catch (err) {
      console.error("Error while fetching data:", err);
      setError("Error while fetching data");
    }
  };

  return (
    <div>
      <button type="button" onClick={fetchData}>
        Fetch Question and Flag
      </button>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {flag && <p>Flag: {flag}</p>}
    </div>
  );
};

export default FetchData;
