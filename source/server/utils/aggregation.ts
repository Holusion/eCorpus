import { HistoryEntry } from "../vfs/types.js";


type AggregatedEntry = [HistoryEntry, ...HistoryEntry[]];
type HistoryBucket = AggregatedEntry[];

interface EntryDiff{
  src: HistoryEntry;
  dst: HistoryEntry;
  diff: string;
}

interface HistorySummary{
  name :string;
  authoredBy :string;
  restorePoint :number;
  from: Date;
  to:Date;
  showDetails?: ()=>void;
}


/**
 * Slice an array of entries into an aggregation, adjusting the timeframe as needed to try to return 3 buckets
 * Base bucket duration is 1 minute.
 */
export function bucketize(entries :HistoryEntry[], duration :number= (1/3)*24*60*60*1000/16384) :HistoryBucket{
  if(24*60*60*1000 < duration) throw new Error("Duration too long. Infinite loop?");
  if(entries.length <= 3) return entries.map(e=>([e]));
  let buckets :HistoryBucket = [];
  let current :AggregatedEntry|null = null;
  let bucket_end = 0;
  for(let e of entries){
    if(!current || e.ctime.valueOf()+ duration < bucket_end){
      bucket_end = e.ctime.valueOf();
      current = [e];
      buckets.push(current);
    }else{
      current.push(e);
    }
  }
  if(4 < buckets.length){
    return bucketize(entries, duration *2);
  }else if (buckets.length === 1){
    let sep = Math.floor(entries.length/2);
    return [entries.slice(0, sep), entries.slice(sep)] as any;
  }
  return buckets;
}