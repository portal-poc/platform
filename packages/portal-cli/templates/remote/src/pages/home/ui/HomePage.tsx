import { useSuspenseQuery } from '@tanstack/react-query';
import { List, ListItem, Typography } from '@portal-poc/ds';
import { usePageTitle } from '@portal-poc/platform-runtime';
import { itemsListOptions } from '@/shared/api';

export const HomePage = () => {
  // The host shows "Home · <section> · Portal"; every page names itself the same way.
  usePageTitle('Home');
  const { data } = useSuspenseQuery(itemsListOptions());

  if (data.length === 0) {
    return <Typography level="body-sm">Nothing here yet.</Typography>;
  }
  return (
    <List>
      {data.map((item) => (
        <ListItem key={item.id}>{item.title}</ListItem>
      ))}
    </List>
  );
};
