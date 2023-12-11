import React, { useState } from "react";
import Papa from "papaparse";
import OpenAI from "openai";
import "./fileUpload.css"

const openai = new OpenAI({
  apiKey: process.env.REACT_APP_OPENAIKEY,
  dangerouslyAllowBrowser: true,
});

const FileUpload = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [csvUrl, setCsvUrl] = useState(null);
  const [showDownload, setShowDownload] = useState(false);
  const [loading, setLoading] = useState(false);
  const [additionalPrompt, setAdditionalPrompt] = useState("");

  const openAIAPICall = async (dateArray) => {
    const start = `
        The format is defined as:
        [WEEKDAYS or DATE] [TIME SPAN]; [WEEKDAYS or DATE] [TIME SPAN];...
  
        WEEKDAYS: Valid weekdays use the first 2 letters of the English spelled day: Mo, Tu, We, Th, Fr, Sa, Su, and public holidays are represented as Ph.
  
        DATE: A specific day can be entered with this format: YYYY MMM DD, for example, 2017 Jan 2 or 2018 Oct 31.
  
        TIME SPAN: A time span can be two 24-hour times joined by a hyphen (-) or the word open, which means open 24 hours, or the word closed. Using a time span of two 24-hour times, use this format for the time: HH:MM, for example, 10:00 (10:00 am) or 23:00 (11:00 pm). The time span could look like this: 10:00-23:00, which means open from 10 am until 11 pm.
  
        Some full examples:
  
        "Mo, Tu, We, Th, Fr open; Sa, Su closed" specifies that we are open 24 hours Monday through Friday but closed on Saturday and Sunday.
  
        "Mo 10:00-20:00; Tu 09:00-18:00; We closed; Th 08:00-17:00; Fr open; 2017 Jan 1 closed; 2017 Dec 25 12:00-15:00" specifies that we are open Monday from 10 am until 8 pm, open Tuesday from 9 am until 6 pm, closed Wednesday, open Thursday 8 am until 5 pm, open Friday from midnight Friday morning until midnight Saturday morning, closed January 1, 2017, have shorter hours on December 25, 2017, from 12 noon until 3 pm.
  
        These are keywords that should be replaced ${additionalPrompt}

        If instead you want to clear the hours of a location (generally with the intention that the store will follow the venue's hours), you can use the special value "clear-hours" to indicate this.
  
        this is the input format with some examples
  
        can you reformat the following list of strings:
        `;

    const end = `
        only output the reformatted strings and nothing else, not even a message. this output will be used in the code
        `;

    const updatedHours = [];

    for (let i = 0; i < dateArray.length; i++) {
      const completion = await openai.chat.completions.create({
        messages: [{ role: "system", content: start + dateArray[i].toString() + end }],
        model: "gpt-3.5-turbo",
      });
      updatedHours.push(completion.choices[0].message.content);
    }

    return updatedHours;
  };

  const handleFileChange = (event) => {
    setShowDownload(false);
    setSelectedFile(event.target.files[0]);
  };

  const modifyHours = (rows, newHours) => {
    const modifiedHours = rows.map((location) => {
      for (const [key, value] of newHours) {
        if (
          (location.name && value.includes(location.name)) ||
          (location.name_en && value.includes(location.name_en))
        ) {
          location.opening_hours = key;
        }
      }
      return location;
    });

    const processedRows = modifiedHours.map((location) => {
      for (const field in location) {
        location[field] = '"' + location[field] + '"'
      }
      return location;
    });

    const locationsArray = [Object.keys(processedRows[0])].concat(
      processedRows
    );
    createCsv(locationsArray);
  };

  const createCsv = (locations) => {
    const csvData = locations
      .map((location) => {
        return Object.values(location).toString();
      })
      .join("\n");
    var blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    setCsvUrl(url);
    setLoading(false);
    setShowDownload(true);
  };

  const downloadCSV = () => {
    let link = document.createElement("a");
    if (link.download !== undefined) {
      link.setAttribute("href", csvUrl);
      link.setAttribute("download", "my_file.csv");
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const onFileUpload = (file) => {
    Papa.parse(file, {
      complete: async (result) => {
        const uniqueOpeningHours = new Map();
        result.data.forEach((row) => {
          if (row.opening_hours) {
            if (!uniqueOpeningHours.has(row.opening_hours)) {
              uniqueOpeningHours.set(row.opening_hours, []);
            }
            uniqueOpeningHours
              .get(row.opening_hours)
              .push(row.name ?? row.name_en);
          }
        });

        const reformattedOpeningHours = await openAIAPICall(
          Array.from(uniqueOpeningHours.keys())
        );
        const updatedUniqueOpeningHours = new Map();

        const valuesArray = Array.from(uniqueOpeningHours.values());
        const keysArray = Array.from(uniqueOpeningHours.keys());

        keysArray.forEach((key, index) => {
          updatedUniqueOpeningHours.set(
            reformattedOpeningHours[index],
            valuesArray[index]
          );
        });

        modifyHours(result.data, updatedUniqueOpeningHours);
      },
      header: true,
    });
  };

  const handleUpload = () => {
    if (selectedFile) {
      setLoading(true);
      onFileUpload(selectedFile);
    }
  };

  const handleTextareaChange = (event) => {
    setAdditionalPrompt(event.target.value);
    setShowDownload(false);
  };

  return (
    <div className="file-processing-wrapper">
      <div className="input-wrapper">
        {loading && <div className="loader"/>}
        <label className="custom-file-input">
          <input type="file" accept=".csv" onChange={handleFileChange} />
          <div className="custom-input">Select a file</div>
          <div className="custom-input-message">{selectedFile && selectedFile.name ? selectedFile.name : 'No file selected'}</div>
        </label>
        <button className="upload-button" onClick={handleUpload}>Upload</button>
      </div>
      <p className="additional-info-prompt">
        For specific inputs to be used in the prompt
      </p>
      <textarea className="extra-info-text-area" value={additionalPrompt} onChange={handleTextareaChange} />
      {showDownload && (
        <button className="download-button" onClick={downloadCSV}>
          Download CSV
        </button>
      )}
    </div>
  );
};

export default FileUpload;
