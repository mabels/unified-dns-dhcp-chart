import { Fragment } from "react";
import { Listbox, Transition } from "@headlessui/react";
import type { ZoneData } from "../types/zone";

interface ZoneSelectorProps {
  zones: ZoneData[];
  selected: ZoneData | "all";
  onChange: (zone: ZoneData | "all") => void;
}

export function ZoneSelector({ zones, selected, onChange }: ZoneSelectorProps) {
  const allOption = { zone: "all", records: [] };
  const options = [allOption, ...zones];

  const selectedOption = selected === "all" ? allOption : selected;

  return (
    <Listbox value={selectedOption} onChange={(val) => onChange(val.zone === "all" ? "all" : val as ZoneData)}>
      <div className="relative">
        <Listbox.Button className="relative w-full cursor-pointer rounded-lg bg-white dark:bg-gray-700 py-2 pl-3 pr-10 text-left text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm">
          <span className="block truncate">
            {selected === "all" ? "All Zones" : selected.zone}
          </span>
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
            <svg className="h-5 w-5 text-gray-400 dark:text-gray-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </span>
        </Listbox.Button>
        <Transition
          as={Fragment}
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-gray-700 py-1 text-base shadow-lg ring-1 ring-black dark:ring-gray-600 ring-opacity-5 focus:outline-none sm:text-sm">
            {options.map((option) => (
              <Listbox.Option
                key={option.zone}
                className={({ active }) =>
                  `relative cursor-pointer select-none py-2 pl-3 pr-9 ${
                    active ? "bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100" : "text-gray-900 dark:text-gray-100"
                  }`
                }
                value={option}
              >
                {({ selected: isSelected }) => (
                  <>
                    <span className={`block truncate ${isSelected ? "font-semibold" : "font-normal"}`}>
                      {option.zone === "all" ? "All Zones" : option.zone}
                    </span>
                    {option.zone !== "all" && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                        ({option.records.length} records)
                      </span>
                    )}
                    {isSelected && (
                      <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-blue-600 dark:text-blue-400">
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </span>
                    )}
                  </>
                )}
              </Listbox.Option>
            ))}
          </Listbox.Options>
        </Transition>
      </div>
    </Listbox>
  );
}
