// 依縣市劃分台灣北、中、南、東部（以百岳所列的第一個縣市為主要歸屬）
const REGION_OF = {
  北部: ['臺北市', '新北市', '基隆市', '桃園市', '新竹縣', '新竹市'],
  中部: ['苗栗縣', '臺中市', '彰化縣', '南投縣', '雲林縣'],
  南部: ['嘉義縣', '嘉義市', '臺南市', '高雄市', '屏東縣'],
  東部: ['宜蘭縣', '花蓮縣', '臺東縣'],
};

export const REGIONS = Object.keys(REGION_OF);

export function countyToRegion(county) {
  const c = (county ?? '').replace('台', '臺');
  for (const [region, list] of Object.entries(REGION_OF)) if (list.includes(c)) return region;
  return '其他';
}
